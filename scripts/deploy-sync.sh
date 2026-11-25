#!/usr/bin/env bash
set -euo pipefail
umask 077

cd "$(dirname "$0")/.."

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

release=${1:-}
bundle=dist-sync/sync.mjs
[[ $# == 1 && "$release" =~ ^[[:xdigit:]]{40}$ && "$(git rev-parse HEAD)" == "$release" ]] ||
  fail 'Usage: scripts/deploy-sync.sh <current commit>'
[[ -f "$bundle" ]] || fail "Missing server bundle: $bundle"

host=my-vps
ssh_opts=(-o BatchMode=yes -o ConnectTimeout=10)
key_dir="$HOME/.config/marie-cetys"
key_file="$key_dir/sync.key"
local_work=$(mktemp -d)
remote_work=
cleanup() {
  rm -rf -- "$local_work"
  if [[ -n "$remote_work" ]]; then
    ssh "${ssh_opts[@]}" "$host" rm -rf -- "$remote_work" || true
  fi
}
trap cleanup EXIT

if [[ ! -e "$key_file" && ! -L "$key_file" ]]; then
  existing=$(ssh "${ssh_opts[@]}" "$host" 'sudo -n sh -s' <<'CHECK'
if test -e /etc/marie-cetys-sync/key.hash || test -L /etc/marie-cetys-sync/key.hash; then
  printf 'yes\n'
else
  printf 'no\n'
fi
CHECK
)
  [[ "$existing" == no ]] || fail "Restore the original sync key at $key_file before deploying."
  [[ ! -L "$key_dir" ]] || fail "Expected a local directory at $key_dir."
  install -d -m 0700 "$key_dir"
  key_stage=$(mktemp "$key_dir/.sync.key.XXXXXXXX")
  if ! openssl rand -hex 32 > "$key_stage"; then
    rm -f -- "$key_stage"
    fail 'Could not generate a sync key.'
  fi
  if ln -- "$key_stage" "$key_file"; then
    printf 'Created sync key file: %s\n' "$key_file"
  fi
  rm -f -- "$key_stage"
fi
[[ -f "$key_file" && ! -L "$key_file" && -O "$key_file" && "$(stat -c %a "$key_file")" == 600 ]] ||
  fail "Expected a private, regular file at $key_file with permissions 0600."
[[ "$(wc -c < "$key_file")" -le 65 ]] && LC_ALL=C grep -qx '[0-9a-f]\{64\}' "$key_file" ||
  fail "Invalid sync key format in $key_file."
tr -d '\n' < "$key_file" | sha256sum | cut -d ' ' -f 1 > "$local_work/key.hash"
bundle_hash=$(sha256sum < "$bundle")

upload_dir=$(ssh "${ssh_opts[@]}" "$host" 'mktemp -d /tmp/marie-cetys-sync.XXXXXXXX')
[[ "$upload_dir" =~ ^/tmp/marie-cetys-sync\.[[:alnum:]]{8}$ ]] || fail 'Unexpected sync upload directory.'
remote_work=$upload_dir
scp "${ssh_opts[@]}" "$bundle" "$local_work/key.hash" scripts/marie-cetys-sync.service "$host:$remote_work/"

ssh "${ssh_opts[@]}" "$host" sudo -n bash -s -- "$release" "$remote_work" "${bundle_hash%% *}" <<'REMOTE'
set -euo pipefail
umask 077

release=$1
work=$2
bundle_hash=$3
base=/opt/marie-cetys-sync
current="$base/current"
target="$base/releases/$release"
key_file=/etc/marie-cetys-sync/key.hash
unit=marie-cetys-sync.service
unit_file="/etc/systemd/system/$unit"
nginx_changed=0
unit_changed=0
link_changed=0
service_changed=0
previous=
backup=
stage=
declare -A changed=()

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

[[ "$release" =~ ^[[:xdigit:]]{40}$ && "$work" =~ ^/tmp/marie-cetys-sync\.[[:alnum:]]{8}$ &&
   "$bundle_hash" =~ ^[[:xdigit:]]{64}$ ]] || fail 'Invalid sync release parameters.'
/usr/bin/node --input-type=module -e 'if (import.meta.main !== true) process.exit(1)' ||
  fail 'Install a Node.js version with import.meta.main support before releasing sync.'
printf '%s  %s\n' "$bundle_hash" "$work/sync.mjs" | sha256sum -c --status ||
  fail 'The uploaded sync bundle failed verification.'
LC_ALL=C grep -qx '[0-9a-f]\{64\}' "$work/key.hash" || fail 'Invalid key digest.'
for domain in math.musel.dev piensa.musel.dev; do
  [[ "$(readlink -f "/etc/nginx/sites-enabled/$domain")" == "/etc/nginx/sites-available/$domain" ]] ||
    fail "Unexpected nginx configuration path for $domain."
done
nginx -t

install -d -m 0755 "$base" "$base/releases" /var/www/marie-cetys
exec 9>/var/www/marie-cetys/deploy.lock
flock -x -w 30 9 || fail 'Another deployment holds the lock.'

install -d -m 0700 /etc/marie-cetys-sync
if [[ -e "$key_file" || -L "$key_file" ]]; then
  [[ -f "$key_file" && ! -L "$key_file" ]] && cmp -s "$work/key.hash" "$key_file" ||
    fail 'The local key differs from the provisioned sync key. Restore the original local key.'
else
  install -o root -g root -m 0600 "$work/key.hash" "$key_file"
fi

if [[ -L "$current" ]]; then
  previous=$(readlink "$current")
elif [[ -e "$current" ]]; then
  fail 'The existing sync release path is not a symlink.'
fi
was_active=0
was_enabled=0
if systemctl is-active --quiet "$unit"; then was_active=1; fi
if systemctl is-enabled --quiet "$unit"; then was_enabled=1; fi

switch_current() {
  ln -sfn -- "$1" "$base/.current.$$" && mv -Tf -- "$base/.current.$$" "$current"
}

install_config() {
  local source=$1 destination=$2
  install -m 0644 "$source" "$destination.marie-cetys-sync.$$" &&
    mv -Tf -- "$destination.marie-cetys-sync.$$" "$destination"
}

update_config() {
  local source=$1 destination=$2 name
  if cmp -s "$source" "$destination"; then return; fi
  name=${destination##*/}
  if [[ -e "$destination" ]]; then cp -p -- "$destination" "$backup/$name"; fi
  changed["$destination"]=1
  install_config "$source" "$destination"
}

finish() {
  local status=$? restored=0 destination name
  trap - EXIT
  set +e
  if (( status != 0 && (link_changed || nginx_changed || unit_changed || service_changed) )); then
    printf '%s\n' 'Sync deployment failed. Restoring configuration and the previous sync release.' >&2
    if (( service_changed && !was_enabled )); then systemctl disable "$unit" > /dev/null 2>&1 || true; fi
    if (( service_changed && !was_active )); then systemctl stop "$unit" || restored=1; fi
    if (( link_changed )); then
      if [[ -n "$previous" ]]; then switch_current "$previous" || restored=1
      else rm -f -- "$current" || restored=1; fi
    fi
    for destination in "${!changed[@]}"; do
      name=${destination##*/}
      if [[ -f "$backup/$name" ]]; then
        install_config "$backup/$name" "$destination" || restored=1
      else
        rm -f -- "$destination" || restored=1
      fi
    done
    if (( unit_changed )); then systemctl daemon-reload || restored=1; fi
    if (( service_changed && was_active )); then systemctl restart "$unit" || restored=1; fi
    if (( nginx_changed )); then (nginx -t && systemctl reload nginx) || restored=1; fi
    if (( restored )); then printf 'Sync rollback requires attention. Backup: %s\n' "$backup" >&2; fi
  fi
  if [[ -n "$stage" ]]; then rm -rf -- "$stage"; fi
  rm -f -- "$base/.current.$$"
  for destination in "${!changed[@]}"; do rm -f -- "$destination.marie-cetys-sync.$$"; done
  exit "$status"
}
trap finish EXIT
trap 'exit 1' HUP INT TERM

install -d -m 0700 "$base/backups"
backup=$(mktemp -d "$base/backups/$release.XXXXXXXX")
stage=$(mktemp -d "$base/releases/.$release.XXXXXXXX")
install -m 0644 "$work/sync.mjs" "$stage/sync.mjs"
chmod 0755 "$stage"
if [[ -d "$target" && ! -L "$target" ]]; then
  cmp -s "$stage/sync.mjs" "$target/sync.mjs" || fail "The existing sync release differs: $target"
elif [[ -e "$target" || -L "$target" ]]; then
  fail 'The sync release path is not a directory.'
else
  mv -T -- "$stage" "$target"
  stage=
fi

cat > "$work/marie-cetys-sync-proxy.conf" <<'NGINX'
auth_basic off;
client_max_body_size 12m;
proxy_pass http://127.0.0.1:8417;
proxy_http_version 1.1;
proxy_request_buffering off;
proxy_cache off;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
NGINX
proxy_config=/etc/nginx/snippets/marie-cetys-sync-proxy.conf
if ! cmp -s "$work/marie-cetys-sync-proxy.conf" "$proxy_config"; then
  nginx_changed=1
  update_config "$work/marie-cetys-sync-proxy.conf" "$proxy_config"
fi
for domain in math.musel.dev piensa.musel.dev; do
  route=/api/progress
  if [[ "$domain" == math.musel.dev ]]; then route=/piensa$route; fi
  site="/etc/nginx/sites-available/$domain"
  snippet="/etc/nginx/snippets/marie-cetys-sync-$domain.conf"
  printf 'location = %s {\n    include %s;\n}\n\nlocation = %s/session {\n    include %s;\n}\n' \
    "$route" "$proxy_config" "$route" "$proxy_config" > "$work/${snippet##*/}"
  awk -v name="server_name $domain;" -v include_line="    include $snippet;" '
    /^[[:space:]]*server[[:space:]]*\{/ { tls = 0 }
    /^[[:space:]]*listen[[:space:]]+443[[:space:]]+ssl([[:space:];]|$)/ { tls = 1 }
    tls && $1 " " $2 == name { print; print include_line; matches++; next }
    $0 == include_line { next }
    { print }
    END { if (matches != 1) exit 1 }
  ' "$site" > "$work/$domain" || fail "Cannot identify the HTTPS configuration for $domain."
  if ! cmp -s "$work/${snippet##*/}" "$snippet" || ! cmp -s "$work/$domain" "$site"; then
    nginx_changed=1
    update_config "$work/${snippet##*/}" "$snippet"
    update_config "$work/$domain" "$site"
  fi
done
nginx -t

if ! cmp -s "$work/marie-cetys-sync.service" "$unit_file"; then
  unit_changed=1
  update_config "$work/marie-cetys-sync.service" "$unit_file"
  systemctl daemon-reload
fi
bundle_changed=0
if ! cmp -s "$target/sync.mjs" "$current/sync.mjs"; then bundle_changed=1; fi
if [[ "$previous" != "releases/$release" ]]; then
  link_changed=1
  switch_current "releases/$release"
fi
service_changed=1
if (( unit_changed || bundle_changed )); then systemctl restart "$unit"
else systemctl start "$unit"; fi

check_status() {
  local url=$1 expected=$2 status
  status=$(curl --silent --show-error --max-time 10 --output /dev/null \
    --dump-header "$work/sync-response.headers" --write-out '%{http_code}' "$url") || return 1
  [[ "$status" == "$expected" ]] && grep -iq $'^cache-control: no-store\r$' "$work/sync-response.headers"
}

ready=0
for attempt in {1..5}; do
  if check_status http://127.0.0.1:8417/api/progress 401; then ready=1; break; fi
  sleep 1
done
(( ready )) || fail 'Sync did not start or refused its local health check.'
if (( nginx_changed )); then systemctl reload nginx; fi

for url in https://piensa.musel.dev/api/progress https://math.musel.dev/piensa/api/progress; do
  ready=0
  for attempt in {1..5}; do
    if check_status "$url" 401 && check_status "$url/session" 405; then ready=1; break; fi
    sleep 1
  done
  (( ready )) || fail "Sync did not pass its HTTPS authorization check: $url"
done
systemctl enable "$unit"
printf 'Sync %s responds on both HTTPS hosts.\n' "$release"
REMOTE
