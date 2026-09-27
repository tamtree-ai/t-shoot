#!/usr/bin/env bash
# Start t-shoot: its own Postgres (container `tamshoot`, :5433), migrations, the dev seed,
# the Next.js app on :${PORT:-3007} and the job worker. Touches nothing outside this repo;
# Tamtree is reached only over HTTP, per .env.local.
#
#   scripts/start.sh            then scripts/stop.sh
#
# Logs and pids: .run/
set -euo pipefail
set -m # each background job gets its own process group, so stop.sh can kill the whole tree

cd "$(dirname "$0")/.."
PORT=${PORT:-3007}
mkdir -p .run

[ -f .env.local ] || { echo "No .env.local — cp .env.example .env.local first." >&2; exit 1; }
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
pnpm --silent db:seed >>.run/db.log 2>&1 || { echo "  pnpm db:seed failed — see .run/db.log" >&2; exit 1; }
echo "  Postgres on :5433, migrated and seeded"

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
