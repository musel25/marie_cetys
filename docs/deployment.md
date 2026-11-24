# Deploy the PIENSE II study site

The public study site uses [math.musel.dev/piensa/](https://math.musel.dev/piensa/).
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

The script compares the local commit with the current upstream branch on GitHub. It installs dependencies from the lockfile and runs the checks again before upload. It uses the `my-vps` SSH alias with your existing SSH key and passwordless `sudo` access.

The script uploads only the tested `dist/` directory. Each release goes in `/var/www/marie-cetys/releases/<commit>`. An atomic symlink switch updates `/var/www/marie-cetys/current`.

The initial deployment adds an include to the existing HTTPS server for `math.musel.dev`. The include serves the study site under `/piensa/`. It redirects `/piensa` to `/piensa/`. The browser revalidates HTML and can cache Vite's hashed files under `/piensa/assets/` for a year.

The script checks the nginx configuration before activation. It checks the public HTTPS response and the local Math Trainer backend before and after activation. It also checks that `/piensa/` and the Vite entry script return HTTP 200 with the exact contents of the build.

## Restore a release

If activation or the final checks fail, the script restores the previous symlink and any nginx files that it changed. It keeps release files and stores nginx backups in `/var/www/marie-cetys/nginx-backups/`.

To restore an earlier version after a successful deployment, revert the relevant commits, push the branch and run the script again. This records the rollback in Git.

After a release or rollback, open [the study site](https://math.musel.dev/piensa/) in a browser. Confirm that Math Trainer still presents its authentication challenge.

```sh
curl -sS -o /dev/null -w '%{http_code}\n' https://math.musel.dev/piensa/
curl -sS -o /dev/null -w '%{http_code}\n' https://math.musel.dev/
```

The study site returns `200`. Math Trainer returns `401` to an unauthenticated request.
