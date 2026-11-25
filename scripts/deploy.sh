#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

host=my-vps
origin_url=https://math.musel.dev

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

[[ $# -eq 0 ]] || fail 'Usage: scripts/deploy.sh'
[[ -z $(git status --porcelain) ]] || fail 'Commit and push all changes before deployment.'

release=$(git rev-parse HEAD)
upstream=$(git rev-parse --symbolic-full-name '@{upstream}') ||
  fail 'Push this branch to origin and set its upstream before deployment.'
[[ "$upstream" == refs/remotes/origin/* ]] || fail 'This branch must track a branch on origin.'
remote_ref="refs/heads/${upstream#refs/remotes/origin/}"
remote_head=$(git ls-remote --exit-code origin "$remote_ref") || fail "Cannot read $remote_ref on origin."
[[ "${remote_head%%$'\t'*}" == "$release" ]] || fail 'Local HEAD must match the branch on origin.'

npm ci
npm run check
[[ -z $(git status --porcelain) && $(git rev-parse HEAD) == "$release" ]] ||
  fail 'The checkout changed during the build.'

# The production HTML identifies the hashed Vite entry point for the asset check.
asset=$(sed -nE 's#.*src="\./(assets/[^"]+\.js)".*#\1#p' dist/index.html)
[[ "$asset" =~ ^assets/[[:alnum:]_-]+\.js$ && -f "dist/$asset" ]] ||
  fail 'Cannot find the relative Vite entry script in dist/index.html.'
index_hash=$(sha256sum < dist/index.html)
asset_hash=$(sha256sum < "dist/$asset")

./scripts/deploy-sync.sh "$release"

local_work=$(mktemp -d)
remote_work=
cleanup() {
  rm -rf -- "$local_work"
  if [[ -n "$remote_work" ]]; then
    ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" rm -rf -- "$remote_work" || true
  fi
}
trap cleanup EXIT

tar -C dist -czf "$local_work/dist.tar.gz" .
upload_dir=$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" 'mktemp -d /tmp/marie-cetys.XXXXXXXX')
[[ "$upload_dir" =~ ^/tmp/marie-cetys\.[[:alnum:]]{8}$ ]] || fail 'Unexpected upload directory.'
remote_work=$upload_dir
scp -o BatchMode=yes -o ConnectTimeout=10 "$local_work/dist.tar.gz" "$host:$remote_work/dist.tar.gz"

ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" sudo -n bash -s -- \
  "$release" "$remote_work" "$asset" "${index_hash%% *}" "${asset_hash%% *}" <<'REMOTE'
set -euo pipefail

release=$1
work=$2
asset=$3
index_hash=$4
asset_hash=$5
base=/var/www/marie-cetys
site=/etc/nginx/sites-available/math.musel.dev
snippet=/etc/nginx/snippets/marie-cetys.conf
url=https://math.musel.dev
canonical=https://piensa.musel.dev
target="$base/releases/$release"
current="$base/current"

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

[[ "$release" =~ ^[[:xdigit:]]{40}$ && "$work" =~ ^/tmp/marie-cetys\.[[:alnum:]]{8}$ &&
   "$asset" =~ ^assets/[[:alnum:]_-]+\.js$ && "$index_hash" =~ ^[[:xdigit:]]{64}$ &&
   "$asset_hash" =~ ^[[:xdigit:]]{64}$ ]] || fail 'Invalid release parameters.'
[[ "$(readlink -f /etc/nginx/sites-enabled/math.musel.dev)" == "$site" ]] ||
  fail 'The enabled Math Trainer site does not use the expected nginx file.'

install -d -m 0755 "$base" "$base/releases"
exec 9>"$base/deploy.lock"
flock -x -w 30 9 || fail 'Another deployment holds the lock.'

check_math_trainer() {
  local status
  status=$(curl --silent --show-error --max-time 10 --output /dev/null \
    --dump-header "$work/root.headers" --write-out '%{http_code}' "$url/") || return 1
  [[ "$status" == 401 ]] || return 1
  grep -iEq '^www-authenticate: Basic realm="mathtrainer"' "$work/root.headers" || return 1
  curl -fsS --max-time 10 -H 'Host: math.musel.dev' http://127.0.0.1:8001/ > "$work/math.html" || return 1
  grep -Fq '<title>mathtrainer</title>' "$work/math.html"
}

check_math_trainer || fail 'Math Trainer failed its baseline check.'
printf 'Before deployment: Math Trainer HTTPS 401 with its expected authentication realm.\n'
for path in /piensa/ "/piensa/$asset"; do
  status=$(curl --silent --show-error --max-time 10 --output /dev/null --write-out '%{http_code}' "$url$path")
  [[ "$status" == 401 || "$status" == 404 || "$status" == 200 ]] ||
    fail "Unexpected baseline response at $path: HTTP $status."
  printf 'Before deployment: %s HTTP %s.\n' "$path" "$status"
done

nginx -t
previous=
if [[ -L "$current" ]]; then
  previous=$(readlink "$current")
elif [[ -e "$current" ]]; then
  fail "$current exists and is not a symlink."
fi

stage=
backup=
site_changed=0
snippet_changed=0
current_changed=0

switch_current() {
  ln -sfn -- "$1" "$base/.current.$$" && mv -Tf -- "$base/.current.$$" "$current"
}

install_config() {
  local source=$1 destination=$2
  install -m 0644 "$source" "$destination.marie-cetys.$$" &&
    mv -Tf -- "$destination.marie-cetys.$$" "$destination"
}

finish() {
  local status=$? restore_failed=0
  trap - EXIT
  set +e
  if (( status != 0 && (site_changed || snippet_changed || current_changed) )); then
    printf '%s\n' 'Deployment failed. Restoring the previous site and release.' >&2
    if (( current_changed )); then
      if [[ -n "$previous" ]]; then
        switch_current "$previous" || restore_failed=1
      else
        rm -f -- "$current" || restore_failed=1
      fi
    fi
    if (( site_changed )); then
      install_config "$backup/site.conf" "$site" || restore_failed=1
    fi
    if (( snippet_changed )); then
      if [[ -f "$backup/snippet.conf" ]]; then
        install_config "$backup/snippet.conf" "$snippet" || restore_failed=1
      else
        rm -f -- "$snippet" || restore_failed=1
      fi
    fi
    if (( site_changed || snippet_changed )); then
      (nginx -t && systemctl reload nginx) || restore_failed=1
    fi
    check_math_trainer || restore_failed=1
    if (( restore_failed )); then
      printf 'Rollback needs attention. Configuration backup: %s\n' "${backup:-none}" >&2
    fi
  fi
  if [[ -n "$stage" ]]; then
    rm -rf -- "$stage"
  fi
  rm -f -- "$base/.current.$$" "$site.marie-cetys.$$" "$snippet.marie-cetys.$$"
  exit "$status"
}
trap finish EXIT
trap 'exit 1' HUP INT TERM

stage=$(mktemp -d "$base/releases/.$release.XXXXXXXX")
tar --no-same-owner --no-same-permissions -xzf "$work/dist.tar.gz" -C "$stage"
printf '%s  %s\n%s  %s\n' "$index_hash" index.html "$asset_hash" "$asset" |
  (cd "$stage" && sha256sum -c -)
chmod -R a+rX "$stage"
if [[ -d "$target" && ! -L "$target" ]]; then
  diff -qr "$stage" "$target" || fail "The existing release differs: $target"
elif [[ -e "$target" || -L "$target" ]]; then
  fail "The release path is not a directory: $target"
else
  mv -T -- "$stage" "$target"
  stage=
fi

cat > "$work/snippet.conf" <<'NGINX'
location = /piensa {
    return 301 /piensa/$is_args$args;
}

location ^~ /piensa/assets/ {
    alias /var/www/marie-cetys/current/assets/;
    expires 1y;
}

location ^~ /piensa/ {
    alias /var/www/marie-cetys/current/;
    index index.html;
    expires -1;
}
NGINX

awk -v include_line="    include $snippet;" '
  /^[[:space:]]*server[[:space:]]*\{/ { tls = 0 }
  /^[[:space:]]*listen[[:space:]]+443[[:space:]]+ssl([[:space:];]|$)/ { tls = 1 }
  tls && /^[[:space:]]*server_name[[:space:]]+math\.musel\.dev[[:space:]]*;[[:space:]]*$/ {
    print
    print include_line
    matches++
    next
  }
  $0 == include_line { existing++; next }
  { print }
  END { if (matches != 1 || existing > 1) exit 1 }
' "$site" > "$work/site.conf" || fail 'Cannot identify a unique HTTPS configuration for Math Trainer.'

if ! cmp -s "$work/site.conf" "$site" || ! cmp -s "$work/snippet.conf" "$snippet"; then
  install -d -m 0700 "$base/nginx-backups"
  backup=$(mktemp -d "$base/nginx-backups/$release.XXXXXXXX")
  cp -p -- "$site" "$backup/site.conf"
  if [[ -e "$snippet" ]]; then
    cp -p -- "$snippet" "$backup/snippet.conf"
  fi
  if ! cmp -s "$work/snippet.conf" "$snippet"; then
    snippet_changed=1
    install_config "$work/snippet.conf" "$snippet"
  fi
  if ! cmp -s "$work/site.conf" "$site"; then
    site_changed=1
    install_config "$work/site.conf" "$site"
  fi
fi

nginx -t
current_changed=1
switch_current "releases/$release"
if (( site_changed || snippet_changed )); then
  systemctl reload nginx
fi

check_assets() {
  local root=$1 status
  status=$(curl --silent --show-error --max-time 10 --output "$work/served.html" \
    --write-out '%{http_code}' "$root/") || return 1
  [[ "$status" == 200 ]] || return 1
  status=$(curl --silent --show-error --max-time 10 --output "$work/served.js" \
    --write-out '%{http_code}' "$root/$asset") || return 1
  [[ "$status" == 200 ]] || return 1
  printf '%s  %s\n%s  %s\n' "$index_hash" "$work/served.html" "$asset_hash" "$work/served.js" |
    sha256sum -c --status -
}

check_release() {
  local status
  status=$(curl --silent --show-error --max-time 10 --output /dev/null \
    --write-out '%{http_code} %{redirect_url}' "$url/piensa") || return 1
  [[ "$status" == "301 $url/piensa/" ]] || return 1
  check_assets "$url/piensa" && check_assets "$canonical"
}

for attempt in {1..5}; do
  if check_release && check_math_trainer; then
    printf 'Deployed %s. Confirmed both public frontends and Math Trainer.\n' "$release"
    exit 0
  fi
  sleep 1
done
fail 'The HTTPS checks failed after activation.'
REMOTE

printf 'Live: https://piensa.musel.dev/\n'
printf 'Alternate URL: %s/piensa/\n' "$origin_url"
