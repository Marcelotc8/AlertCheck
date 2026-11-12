#!/usr/bin/env bash
# Updates the API on the server after a git push.  Usage: ssh root@IP 'bash /opt/stormcheck/deploy/update.sh'
set -euo pipefail
cd /opt/stormcheck
git pull --ff-only
cd api
npm ci
pm2 restart stormcheck-api --update-env
pm2 status stormcheck-api
