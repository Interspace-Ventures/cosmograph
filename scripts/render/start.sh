#!/usr/bin/env bash
# Render start command for Cosmograph (render.yaml). Same process Railway runs today
# (`pnpm run railway:start` -> `pnpm --filter @workspace/api-server run start`), minus pnpm at
# runtime, wrapped in `op run` so every secret comes from the app's 1Password vault.
#
# - EXO_SECURE_VAULT (plain env, per environment) names the vault; scripts/render/secrets.op.env maps
#   each secret env var to op://$EXO_SECURE_VAULT/<ITEM>/credential.
# - OP_SERVICE_ACCOUNT_TOKEN (sync: false) is the only secret Render holds. Without it the service
#   refuses to start (fail closed): the new deploy never goes healthy and the old one keeps serving.
# - `op run` injects the resolved values into the server process only; they are not in Render's
#   env and not in the dashboard.
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
op="$root/.render/bin/op"

: "${OP_SERVICE_ACCOUNT_TOKEN:?OP_SERVICE_ACCOUNT_TOKEN is not set; refusing to start without the 1Password bootstrap token}"
: "${EXO_SECURE_VAULT:?EXO_SECURE_VAULT is not set}"
[ -x "$op" ] || { echo "1Password CLI missing at $op (scripts/render/install-op.sh runs in the build)" >&2; exit 1; }

# The health route reports GIT_COMMIT_SHA when RAILWAY_GIT_COMMIT_SHA is absent.
export GIT_COMMIT_SHA="${GIT_COMMIT_SHA:-${RENDER_GIT_COMMIT:-unknown}}"

cd "$root/artifacts/api-server"
exec "$op" run --env-file="$root/scripts/render/secrets.op.env" -- node --enable-source-maps ./dist/index.mjs
