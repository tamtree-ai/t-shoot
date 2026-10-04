#!/usr/bin/env bash
# The standalone container: migrate, start the worker and the app, and seed the demo projects in
# the background (the finished demo waits for StickStage, then renders once). If the app or the
# worker stops, the container stops, so compose restarts it.
set -euo pipefail
cd /app
if [ -z "${STICKSTAGE_API_TOKEN:-}" ] && [ -s /secrets/stickstage-token ]; then
  STICKSTAGE_API_TOKEN="$(cat /secrets/stickstage-token)"
  export STICKSTAGE_API_TOKEN
fi
mkdir -p "${TAMSHOOT_LOCAL_DIR:-/data/local}"

echo "[t-shoot] migrating"
node_modules/.bin/drizzle-kit migrate

node_modules/.bin/tsx --conditions=react-server src/worker/index.ts &
worker=$!
node_modules/.bin/next start -p "${PORT:-3000}" -H 0.0.0.0 &
web=$!
# The seed finishing is not the container stopping: only the worker and the app count.
(node_modules/.bin/tsx --conditions=react-server scripts/seed-standalone.ts || echo "[t-shoot] seed failed; the app still works") &

echo "[t-shoot] up on :${PORT:-3000} (inside the container; compose publishes it on 127.0.0.1:3007)"
wait -n "$worker" "$web"
echo "[t-shoot] the app or the worker stopped; stopping the container" >&2
exit 1
