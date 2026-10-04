#!/usr/bin/env bash
# Start t-shoot: its own Postgres (container `tamshoot`, :5433), migrations, the dev seed,
# the Next.js app on :${PORT:-3007} and the job worker. Touches nothing outside this repo;
# Tamtree is reached only over HTTP, per .env.local.
#
#   scripts/start.sh            then scripts/stop.sh
#   scripts/start.sh --standalone
#       no Tamtree: StickStage's render service from a sibling clone ($STICKSTAGE_DIR, default
#       ../stickstage; run pnpm install && pnpm bootstrap there once), Kokoro voices, local
#       sign-in, and the standalone demo seed. Writes a standalone .env.local if there is none.
#
# Logs and pids: .run/
set -euo pipefail
set -m # each background job gets its own process group, so stop.sh can kill the whole tree

cd "$(dirname "$0")/.."
PORT=${PORT:-3007}
mkdir -p .run

STANDALONE=0
[ "${1:-}" = "--standalone" ] && STANDALONE=1
STICKSTAGE_DIR=${STICKSTAGE_DIR:-../stickstage}

if [ "$STANDALONE" = 1 ] && [ ! -f .env.local ]; then
  cat >.env.local <<ENV
DATABASE_URL=postgres://tamshoot:tamshoot@localhost:5433/tamshoot
TAMTREE_ADAPTER=local
TAMSHOOT_AUTH=local
STICKSTAGE_URL=http://127.0.0.1:8787
ENV
  echo "Wrote a standalone .env.local"
fi
[ -f .env.local ] || { echo "No .env.local — cp .env.example .env.local first." >&2; exit 1; }
if [ "$STANDALONE" = 1 ]; then
  grep -q '^TAMTREE_ADAPTER=local' .env.local || { echo ".env.local is not standalone (TAMTREE_ADAPTER=local). Move it aside, or set that line." >&2; exit 1; }
  [ -f "$STICKSTAGE_DIR/package.json" ] || { echo "No StickStage clone at $STICKSTAGE_DIR. Clone it there, or set STICKSTAGE_DIR." >&2; exit 1; }
fi
docker info >/dev/null 2>&1 || { echo "Docker is not running. Start Docker Desktop first." >&2; exit 1; }

running() { [ -f ".run/$1.pid" ] && kill -0 "$(cat ".run/$1.pid")" 2>/dev/null; }

# Next.js allows one dev server per project dir. Prints the port of one already running here.
existing_next_port() {
  local pid port
  for pid in $(pgrep -f 'next-server|next dev'); do
    [ "$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')" = "$PWD" ] || continue
    port=$(lsof -a -p "$pid" -nP -iTCP -sTCP:LISTEN -Fn 2>/dev/null | sed -n 's/^n.*://p' | head -1)
    [ -n "$port" ] && { echo "$port"; return 0; }
  done
  return 0
}

# launch <name> <cmd...>: run in the background, log to .run/<name>.log.
launch() {
  local name=$1
  shift
  nohup "$@" >".run/$name.log" 2>&1 &
  echo $! >".run/$name.pid"
  echo "  started $name (log .run/$name.log)"
}

echo "Database"
pnpm --silent db:up >.run/db.log 2>&1 || { echo "  pnpm db:up failed — see .run/db.log" >&2; exit 1; }
pnpm --silent db:migrate >>.run/db.log 2>&1 || { echo "  pnpm db:migrate failed — see .run/db.log" >&2; exit 1; }
if [ "$STANDALONE" = 1 ]; then
  echo "  Postgres on :5433, migrated"
  echo "StickStage"
  if running stickstage || curl -fsS -o /dev/null http://127.0.0.1:8787/healthz 2>/dev/null; then
    echo "  already running on :8787 — left alone"
  else
    launch stickstage pnpm -C "$STICKSTAGE_DIR" serve --insecure-local
  fi
  # The finished demo waits for StickStage and renders once; the app does not wait for it.
  launch seed pnpm db:seed:standalone
else
  pnpm --silent db:seed >>.run/db.log 2>&1 || { echo "  pnpm db:seed failed — see .run/db.log" >&2; exit 1; }
  echo "  Postgres on :5433, migrated and seeded"
fi

echo "App"
other=$(existing_next_port)
if running web; then
  echo "  web already running — left alone"
elif [ -n "$other" ]; then
  echo "  a next dev server for this repo is already running on :$other (not started by this script) — left alone"
  PORT=$other
  rm -f .run/web.pid
elif lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "  port $PORT is in use by something else — not starting (set PORT=...)" >&2
  exit 1
else
  launch web pnpm exec next dev -p "$PORT"
fi
if running worker; then
  echo "  worker already running — left alone"
else
  launch worker pnpm worker
fi

for _ in $(seq 90); do
  if curl -fsS -o /dev/null "http://localhost:$PORT" 2>/dev/null; then
    echo "Ready: http://localhost:$PORT  (adapter: $(grep '^TAMTREE_ADAPTER=' .env.local | cut -d= -f2-))"
    exit 0
  fi
  if [ -f .run/web.pid ] && ! kill -0 "$(cat .run/web.pid)" 2>/dev/null; then
    echo "The app exited during startup:" >&2
    tail -15 .run/web.log >&2
    exit 1
  fi
  sleep 1
done
echo "No answer on :$PORT after 90s — see .run/web.log" >&2
exit 1
