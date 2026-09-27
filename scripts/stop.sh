#!/usr/bin/env bash
# Stop t-shoot's app and worker (started by scripts/start.sh). Its Postgres keeps running
# unless you pass --db; the data volume is kept either way. Touches nothing outside this repo.
#
#   scripts/stop.sh [--db]
set -uo pipefail

cd "$(dirname "$0")/.."
for name in web worker; do
  pidfile=.run/$name.pid
  [ -f "$pidfile" ] || continue
  pgid=$(cat "$pidfile")
  if kill -0 "$pgid" 2>/dev/null; then
    kill -TERM -- "-$pgid" 2>/dev/null
    for _ in $(seq 10); do kill -0 "$pgid" 2>/dev/null || break; sleep 1; done
    kill -KILL -- "-$pgid" 2>/dev/null
    echo "stopped $name"
  fi
  rm -f "$pidfile"
done

if [ "${1:-}" = "--db" ]; then
  docker compose stop && echo "stopped Postgres (data kept)"
fi
echo "done"
