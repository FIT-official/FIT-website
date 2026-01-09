#!/usr/bin/env bash
# Restarts the Next.js dev server using the PID file created by dev-tunnel.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Source both .env.tunnel and .env.local from scripts/ and project root, in order of priority
for candidate in "$SCRIPT_DIR/.env.tunnel" "$PROJECT_ROOT/.env.tunnel" "$SCRIPT_DIR/.env.local" "$PROJECT_ROOT/.env.local"; do
  if [ -f "$candidate" ]; then
    echo "[restart-dev-server] Sourcing environment variables from $candidate" >&2
    set -a
    # shellcheck disable=SC1090
    . "$candidate"
    set +a
  fi
done

PID_FILE="/tmp/dev-server.pid"
LOG_FILE="/tmp/dev-server.log"

if [ -f "$PID_FILE" ]; then
  DEV_PID=$(cat "$PID_FILE")
  if kill -0 "$DEV_PID" 2>/dev/null; then
    echo "Killing existing dev server (PID $DEV_PID)..."
    kill "$DEV_PID"
    sleep 2
    if kill -0 "$DEV_PID" 2>/dev/null; then
      echo "Force killing dev server (PID $DEV_PID)..."
      kill -9 "$DEV_PID" || true
    fi
  fi
  rm -f "$PID_FILE"
fi

echo "Restarting dev server..."
yarn dev > "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo $NEW_PID > "$PID_FILE"
echo "Dev server restarted with PID $NEW_PID. Logs: $LOG_FILE"
