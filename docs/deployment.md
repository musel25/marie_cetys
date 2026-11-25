# Deploy the PIENSE II study site

The public study site uses [piensa.musel.dev](https://piensa.musel.dev/).
[math.musel.dev/piensa/](https://math.musel.dev/piensa/) serves the same release.
Math Trainer uses [math.musel.dev](https://math.musel.dev/) and requires HTTP Basic authentication.

## Publish a release

1. Review the preview of the version you plan to publish.
2. Run the repository checks from a machine with Node.js 22.12 or later.
3. Commit the changes and push the branch to `origin`.
4. Run the deployment from the same branch with a clean working tree.

```sh
npm ci
npm run check
./scripts/deploy.sh
```

The script compares the local commit with the current upstream branch on GitHub. It installs dependencies from the lockfile, runs the checks, and builds the sync service before upload. It uses the `my-vps` SSH alias with your existing SSH key and passwordless `sudo` access. The VPS needs nginx, systemd, and `/usr/bin/node` with `import.meta.main` support.

Each frontend release goes in `/var/www/marie-cetys/releases/<commit>`. An atomic symlink switch updates `/var/www/marie-cetys/current`. The sync bundle uses a separate release directory under `/opt/marie-cetys-sync/releases/<commit>`.

The initial deployment adds an include to the existing HTTPS server for `math.musel.dev`. The include serves the study site under `/piensa/`. It redirects `/piensa` to `/piensa/`. The browser revalidates HTML and can cache Vite's hashed files under `/piensa/assets/` for a year.

The script checks the nginx configuration before activation. It checks the public HTTPS response and the local Math Trainer backend before and after activation. It verifies the new HTML and Vite entry script on both public frontend URLs.

## Configure progress sync

The first deployment generates a 64-character key at `~/.config/marie-cetys/sync.key` with permissions `0600`. Keep the key in a password manager. Subsequent deployments reuse it. The VPS receives its SHA-256 digest in `/etc/marie-cetys-sync/key.hash`.

The systemd service listens on IPv4 loopback at port 8417. Nginx routes `/api/progress` and `/api/progress/session` on the canonical host. It routes `/piensa/api/progress` and `/piensa/api/progress/session` on the alternate host. The service writes private progress data to `/var/lib/marie-cetys-sync/progress.json`. The service keeps the progress and activation key across releases. A password chosen in the app is stored as a salted scrypt hash in the same private state directory.

Open **Iniciar sesión** on the canonical host and sign in as `marie`. Use the activation key as the initial password. Under **Mi sesión → Cambiar contraseña**, choose a password of at least 12 characters. The activation key remains available for recovery. A password change signs out other devices.

To bring progress from the alternate URL, use **Importar de math.musel.dev** from the main address in the browser that has the old data. Allow the popup if the browser blocks it. Progress from a normal backup merges with existing progress while connected.

## Restore a release

If sync activation fails, the script restores the previous sync symlink, systemd unit and nginx files that it changed. Sync configuration backups are in `/opt/marie-cetys-sync/backups/`. If the frontend fails its final checks, the script restores the previous frontend symlink and its nginx files. Frontend nginx backups are in `/var/www/marie-cetys/nginx-backups/`. Both stages keep their release files.

To restore an earlier version after a successful deployment, revert the relevant commits, push the branch and run the script again. This records the rollback in Git.

After a release or rollback, open [the study site](https://math.musel.dev/piensa/) in a browser. Confirm that Math Trainer still presents its authentication challenge.

```sh
curl -sS -o /dev/null -w '%{http_code}\n' https://math.musel.dev/piensa/
curl -sS -o /dev/null -w '%{http_code}\n' https://piensa.musel.dev/
curl -sS -o /dev/null -w '%{http_code}\n' https://math.musel.dev/
curl -sS -o /dev/null -w '%{http_code}\n' https://piensa.musel.dev/api/progress
curl -sS -o /dev/null -w '%{http_code}\n' https://math.musel.dev/piensa/api/progress
```

Both study pages return `200`. Math Trainer and both sync endpoints return `401` to an unauthenticated request.
