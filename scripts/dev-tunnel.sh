#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# dev-tunnel.sh
# Starts Next.js dev server, launches localtunnel, updates Clerk + Stripe webhook URLs.
# ----------------------------------------------------------------------------
# Requirements:
#  - jq (for JSON parsing)
#  - localtunnel installed globally (npm install -g localtunnel)
#  - curl
#  - Stripe CLI OR stripe API key (for updating webhook endpoints)
#  - Environment variables (see CONFIG section)
# ============================================================================

# ---------------------- AUTO LOAD .env FILES --------------------------------
# Resolve script directory so we can place .env.tunnel inside scripts/.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# Source both .env.tunnel and .env.local from scripts/ and project root, in order of priority
# Source and export all env variables for child processes
# Only source .env.tunnel (for tunnel-specific envs); let Next.js load .env.local/.env
for candidate in "$SCRIPT_DIR/.env.tunnel" "$PROJECT_ROOT/.env.tunnel"; do
  if [ -f "$candidate" ]; then
    echo "[dev-tunnel] Sourcing environment variables from $candidate" >&2
    set -a
    # shellcheck disable=SC1090
    . "$candidate"
    set +a
  fi
done

# ---------------------- CONFIG (env vars) -----------------------------------
# Stripe test secret key (starts with sk_test_...)
: "${STRIPE_API_KEY:?Set STRIPE_API_KEY env var (test secret key)}"

# Webhook endpoint IDs (test mode). Provide the ones you actually have in dashboard.
# You can list with: stripe webhook_endpoints list
: "${STRIPE_SESSION_COMPLETE_WEBHOOK_ID:?Set STRIPE_SESSION_COMPLETE_WEBHOOK_ID}"
: "${STRIPE_DIGITAL_TXN_WEBHOOK_ID:?Set STRIPE_DIGITAL_TXN_WEBHOOK_ID}"         # /api/asset/transaction/complete
: "${STRIPE_SUBSCRIPTION_DELETE_WEBHOOK_ID:?Set STRIPE_SUBSCRIPTION_DELETE_WEBHOOK_ID}" # /api/user/subscription/webhook

# Option: Combine all events into one endpoint (set to 1 to enable). If enabled,
# we will update only STRIPE_SESSION_COMPLETE_WEBHOOK_ID and skip the others.
COMBINE_STRIPE_ENDPOINTS=${COMBINE_STRIPE_ENDPOINTS:-0}

# Port for Next.js dev
DEV_PORT=${DEV_PORT:-3000}

# Timeouts (seconds)
TUNNEL_WAIT_TIMEOUT=${TUNNEL_WAIT_TIMEOUT:-20}
DEV_WAIT_LOG="started server on" # substring to detect dev readiness

# ----------------------------------------------------------------------------
# Helper: log
log(){ printf "[dev-tunnel] %s\n" "$*"; }
err(){ printf "[dev-tunnel][ERROR] %s\n" "$*" >&2; }

# ----------------------------------------------------------------------------
# Start Next.js dev server (background)
log "Starting Next.js dev server on port ${DEV_PORT}..."
# Always run yarn dev from the project root
cd "$PROJECT_ROOT"
yarn dev >/tmp/dev-server.log 2>&1 &
DEV_PID=$!
echo $DEV_PID > /tmp/dev-server.pid
DEV_PGID=$(ps -o pgid= -p "$DEV_PID" | tr -d ' ' || echo "")
log "Dev server PID: ${DEV_PID} PGID: ${DEV_PGID} (saved to /tmp/dev-server.pid)"

# Open a new Terminal window to tail the dev server logs (macOS only)
if command -v osascript >/dev/null 2>&1; then
  osascript -e 'tell application "Terminal"
    do script "tail -f /tmp/dev-server.log"
    activate
  end tell'
fi

# Optional: wait a bit (or watch log). We'll proceed; localtunnel only needs port open.
# Simple wait to avoid race conditions.
sleep 3 || true

# ----------------------------------------------------------------------------
# Start localtunnel (background)
if pgrep -f "localtunnel --port ${DEV_PORT}" >/dev/null 2>&1; then
  log "Existing localtunnel tunnel for port ${DEV_PORT} detected. Skipping new launch."
else
  log "Launching localtunnel tunnel..."
  log "(debug) About to launch localtunnel with real-time log..."
  (
    npx localtunnel --port ${DEV_PORT} --print-requests 2>&1 | tee /tmp/localtunnel.log
  ) &
  echo $! > /tmp/localtunnel.pid
  log "(debug) localtunnel launched, PID saved."
fi
LOCALTUNNEL_PID=$(cat /tmp/localtunnel.pid 2>/dev/null || true)
LOCALTUNNEL_PGID=$(ps -o pgid= -p "$LOCALTUNNEL_PID" | tr -d ' ' || echo "")
[ -n "${LOCALTUNNEL_PID}" ] && log "localtunnel PID: ${LOCALTUNNEL_PID}"

# ----------------------------------------------------------------------------
# Lifecycle management: cleanup on exit / Ctrl+C and keep foreground active
cleanup(){
  if [ "${CLEANED_UP:-0}" = "1" ]; then return; fi
  CLEANED_UP=1
  log "Cleaning up background processes..."
  # Attempt graceful termination of entire process groups first
  for pg in "${DEV_PGID:-}" "${LOCALTUNNEL_PGID:-}"; do
    if [ -n "$pg" ]; then
      kill -TERM -"$pg" 2>/dev/null || true
    fi
  done
  # Fallback: kill individual PIDs if still running
  for pid in "${DEV_PID:-}" "${LOCALTUNNEL_PID:-}"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done
  sleep 1
  # Force kill lingering groups
  for pg in "${DEV_PGID:-}" "${LOCALTUNNEL_PGID:-}"; do
    if [ -n "$pg" ]; then
      # shellcheck disable=SC2046
      if ps -o pgid= -p "$DEV_PID" 2>/dev/null | grep -q "$pg" || ps -o pgid= -p "$LOCALTUNNEL_PID" 2>/dev/null | grep -q "$pg"; then
        kill -KILL -"$pg" 2>/dev/null || true
      fi
    fi
  done
  # Final sweep individual PIDs
  for pid in "${DEV_PID:-}" "${LOCALTUNNEL_PID:-}"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done
  # Extra: kill any next dev or localtunnel processes using the project root or port
  log "Killing any remaining next dev or localtunnel processes for this project root or port..."
  # Kill by port (DEV_PORT)
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti tcp:${DEV_PORT} | xargs -r kill -9 2>/dev/null || true
  fi
  # Kill by project root in process args (POSIX compatible)
  linger_pids=$(ps aux | grep -E "(next dev|next-server|.next/transform|localtunnel --port)" | grep "${PROJECT_ROOT}" | grep -v grep | awk '{print $2}')
  if [ -n "$linger_pids" ]; then
    log "Force killing lingering PIDs: $linger_pids"
    for lp in $linger_pids; do
      kill -KILL "$lp" 2>/dev/null || true
    done
  else
    log "No lingering project-scoped processes found."
  fi
  log "Shutdown complete."
}

trap cleanup INT TERM EXIT


# ----------------------------------------------------------------------------
# Obtain public URL via localtunnel log parsing
log "Waiting for localtunnel public URL... (no timeout)"
PUBLIC_URL=""
while true; do
  if [ -f /tmp/localtunnel.log ]; then
    PUBLIC_URL=$(grep "your url is:" /tmp/localtunnel.log | sed 's/your url is: //' | tr -d '\n' | xargs)
    if [ -n "${PUBLIC_URL}" ] && [ "${PUBLIC_URL}" != "null" ]; then
      break
    fi
  fi
  sleep 1
done
log "localtunnel public URL: ${PUBLIC_URL}"

# ----------------------------------------------------------------------------
# Clerk manual step (no public API to update URL)
CLERK_TARGET_URL="${PUBLIC_URL}/api/newUser"
log "Reminder: Update Clerk webhook destination manually in the Clerk Dashboard to: ${CLERK_TARGET_URL}"

# ----------------------------------------------------------------------------
# Function to update stripe webhook endpoint URL via Stripe CLI (preferred)
update_stripe_endpoint(){
  local endpoint_id=$1
  local new_url=$2
  local label=$3
  log "Updating Stripe endpoint ${endpoint_id} (${label}) -> ${new_url}" 
  local resp
  if command -v stripe >/dev/null 2>&1; then
    # Using CLI (it uses STRIPE_API_KEY automatically)
    if ! resp=$(stripe webhook_endpoints update ${endpoint_id} --url "${new_url}" 2>&1); then
      err "Stripe CLI update failed for ${endpoint_id}: ${resp}"; return 1
    fi
  else
    # Fallback to direct API
    resp=$(curl -s -o /tmp/stripe_${endpoint_id}.json -w "%{http_code}" -X POST \
      https://api.stripe.com/v1/webhook_endpoints/${endpoint_id} \
      -u ${STRIPE_API_KEY}: \
      -d url="${new_url}")
    if [ "${resp}" != "200" ]; then
      err "Stripe API update failed for ${endpoint_id} (HTTP ${resp}). Body:" 
      cat /tmp/stripe_${endpoint_id}.json >&2
      return 1
    fi
  fi
  log "Stripe endpoint ${endpoint_id} updated."
}

# Decide which endpoints to update
if [ "${COMBINE_STRIPE_ENDPOINTS}" = "1" ]; then
  log "COMBINE_STRIPE_ENDPOINTS=1: assuming a single endpoint handles all events."
  update_stripe_endpoint "${STRIPE_SESSION_COMPLETE_WEBHOOK_ID}" "${PUBLIC_URL}/api/webhook/stripe" "combined-events"
else
  update_stripe_endpoint "${STRIPE_SESSION_COMPLETE_WEBHOOK_ID}" "${PUBLIC_URL}/api/webhook/stripe" "checkout.session.completed"
  update_stripe_endpoint "${STRIPE_DIGITAL_TXN_WEBHOOK_ID}" "${PUBLIC_URL}/api/asset/transaction/complete" "digital transaction"
  update_stripe_endpoint "${STRIPE_SUBSCRIPTION_DELETE_WEBHOOK_ID}" "${PUBLIC_URL}/api/user/subscription/webhook" "subscription delete"
fi

log "All updates attempted."

cat <<EOF
-------------------------------------------------------------------------------
Local Dev Environment Ready
-------------------------------------------------------------------------------
Public URL: ${PUBLIC_URL}
Clerk newUser Webhook (manual): ${CLERK_TARGET_URL}
Stripe Session Complete: ${PUBLIC_URL}/api/webhook/stripe
Stripe Digital Transaction: ${PUBLIC_URL}/api/asset/transaction/complete
Stripe Subscription Delete: ${PUBLIC_URL}/api/user/subscription/webhook

To stop:
  kill ${DEV_PID} ${LOCALTUNNEL_PID} 2>/dev/null || true
-------------------------------------------------------------------------------
EOF

# Keep script in foreground unless QUIET_EXIT=1 is set.
if [ "${QUIET_EXIT:-0}" = "1" ]; then
  log "QUIET_EXIT=1 set; not holding terminal open. Background processes may die on terminal close unless disowned."
  exit 0
fi

log "Press Ctrl+C to stop dev server and localtunnel tunnel. Monitoring processes..."

# Wait until either process exits, then cleanup triggers via trap.
while true; do
  alive=0
  for pid in "${DEV_PID}" "${LOCALTUNNEL_PID}"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      alive=$((alive+1))
    fi
  done
  if [ $alive -eq 0 ]; then
    log "Both processes exited."; break
  fi
  sleep 2
done

exit 0
