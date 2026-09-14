#!/usr/bin/env bash
# Invoked by a restricted SSH key; configuration stays on the deployment host.
set -euo pipefail
umask 077

if [[ ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ ([0-9a-f]{40})$ ]]; then
  revision=${BASH_REMATCH[1]}
else
  echo 'Expected: deploy <40-character commit SHA>' >&2
  exit 2
fi
: "${DEPLOY_DIR:?Set DEPLOY_DIR in the server-side SSH wrapper}"
cd "$DEPLOY_DIR"
exec 9>.git/launchpad-deploy.lock
flock -w 600 9
[[ $(git branch --show-current) == main ]]
[[ -z $(git status --porcelain --untracked-files=no) ]]
git fetch origin main
if [[ $(git rev-parse refs/remotes/origin/main) != "$revision" ]]; then
  echo 'Skipping superseded deployment.'
  exit 0
fi
previous=$(docker compose images -q launchpad | head -n 1)
if [[ -n $previous ]]; then
  mkdir -p .deploy-backups
  docker compose exec -T launchpad cat /data/apps.json > ".deploy-backups/apps-$(date -u +%Y%m%dT%H%M%SZ).json"
fi
git merge --ff-only "$revision"
[[ $(git rev-parse HEAD) == "$revision" ]]
docker compose build launchpad
if ! docker compose up -d --no-build --wait --wait-timeout 90 launchpad; then
  echo 'Deployment failed its health check.' >&2
  if [[ -n $previous ]]; then
    image=$(docker compose config --images | head -n 1)
    docker image tag "$previous" "$image"
    docker compose up -d --no-build --wait --wait-timeout 90 launchpad
    echo 'Restored the previous application image.' >&2
  fi
  exit 1
fi
printf '%s\n' "$revision" > .git/launchpad-deployed-revision
echo "Deployed $revision"
