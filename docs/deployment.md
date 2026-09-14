# Continuous deployment

The Checks workflow optionally deploys a passing push to `main` over Tailscale. Pull requests and forks do not deploy. Deployments are serialized, and the server skips commits superseded on `main`.

Configure a GitHub `production` environment restricted to the `main` branch. Set repository variable `DEPLOY_ENABLED=true` after setup; leave it unset to run CI only.

Environment variables:

| Variable | Value |
| --- | --- |
| `TS_CLIENT_ID` | Tailscale federated identity client ID |
| `TS_AUDIENCE` | Audience supplied by Tailscale |
| `TS_DEPLOY_TAG` | Dedicated deployment tag |
| `DEPLOY_HOST` | Server's Tailscale IP or DNS name |
| `DEPLOY_USER` | Linux user owning the deployment checkout |

Environment secrets:

| Secret | Value |
| --- | --- |
| `DEPLOY_SSH_KEY` | Dedicated SSH private key used only for this deployment |
| `DEPLOY_KNOWN_HOSTS` | Server host key, obtained through an already trusted connection |

Create a [Tailscale federated identity](https://tailscale.com/docs/features/workload-identity-federation) for GitHub's issuer. Restrict its subject to the exact GitHub OIDC subject for this repository’s `production` environment and add the custom claim `ref=refs/heads/main`. Depending on the repository’s identity format, the subject may be `repo:OWNER/REPO:environment:production` or include immutable IDs as `repo:OWNER@OWNER_ID/REPO@REPO_ID:environment:production`. If authentication reports a subject mismatch, Tailscale’s credential diagnostics show the received subject; match it exactly instead of using a wildcard. Grant only auth-key creation for the deployment tag. Allow that tag to reach only the target server's TCP port 22; do not include it in broad access rules.

On the server, retain the existing Compose checkout, `.env`, and data volume. Install a wrapper outside the repository, replacing the example checkout path:

```sh
#!/bin/sh
export DEPLOY_DIR=/srv/launchpad
exec /bin/bash "$DEPLOY_DIR/scripts/deploy.sh"
```

Authorize the deployment public key with an absolute wrapper path and SSH restrictions:

```text
restrict,command="/absolute/path/to/launchpad-deploy" ssh-ed25519 PUBLIC_KEY launchpad-cd
```

The wrapper accepts only `deploy <commit SHA>`. Keep its key separate from personal SSH keys. The deploy user needs Docker and Git access; changes trusted on `main` consequently have deployment-host privileges through Docker.

The deployment script requires Bash, Git, `flock`, Docker Compose with `up --wait`, and an existing deployment on branch `main`. It backs up the grid in private `.deploy-backups/` files before building. A failed build leaves the running container alone; a failed container health check attempts to restore the previous image. Backups remain on the server; prune them according to your retention needs. PIN and origin settings stay in the server's `.env`. A successful restart expires browser sessions, as usual.

To stop deployments, set `DEPLOY_ENABLED=false`. The last successful SHA is recorded in `.git/launchpad-deployed-revision` on the server.
