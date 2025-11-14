#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# dev-tunnel.sh
# Starts Next.js dev server, launches ngrok, updates Clerk + Stripe webhook URLs.
# ----------------------------------------------------------------------------
# Requirements:
#  - jq (for JSON parsing)
#  - ngrok installed and authenticated (ngrok config add-authtoken ...)
#  - curl
#  - Stripe CLI OR stripe API key (for updating webhook endpoints)
#  - Environment variables (see CONFIG section)
# ============================================================================

# ---------------------- AUTO LOAD .env FILES --------------------------------
# Resolve script directory so we can place .env.tunnel inside scripts/.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# Attempts to load environment variables from (in order) INSIDE script dir:
#   scripts/.env.tunnel, scripts/.env.local, scripts/.env
# Falls back to current working directory if none found there.
# Only loads the first one found. Variables already present are NOT overridden.
for candidate in "$SCRIPT_DIR/.env.tunnel" "$SCRIPT_DIR/.env.local" "$SCRIPT_DIR/.env" ./.env.tunnel ./.env.local ./.env; do
  if [ -f "$candidate" ]; then
    echo "[dev-tunnel] Loading environment variables from $candidate" >&2
    set -a
    # shellcheck disable=SC1090
    . "$candidate"
    set +a
    break
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
NGROK_WAIT_TIMEOUT=${NGROK_WAIT_TIMEOUT:-20}
DEV_WAIT_LOG="started server on" # substring to detect dev readiness

# ----------------------------------------------------------------------------
# Helper: log
log(){ printf "[dev-tunnel] %s\n" "$*"; }
err(){ printf "[dev-tunnel][ERROR] %s\n" "$*" >&2; }

# ----------------------------------------------------------------------------
# Start Next.js dev server (background)
log "Starting Next.js dev server on port ${DEV_PORT}..."
### Start dev server directly (no subshell grouping) so $! is actual parent PID
yarn dev >/tmp/dev-server.log 2>&1 &
DEV_PID=$!
DEV_PGID=$(ps -o pgid= -p "$DEV_PID" | tr -d ' ' || echo "")
log "Dev server PID: ${DEV_PID} PGID: ${DEV_PGID}"

# Optional: wait a bit (or watch log). We'll proceed; ngrok only needs port open.
# Simple wait to avoid race conditions.
sleep 3 || true

# ----------------------------------------------------------------------------
# Start ngrok (background)
if pgrep -f "ngrok http ${DEV_PORT}" >/dev/null 2>&1; then
  log "Existing ngrok tunnel for port ${DEV_PORT} detected. Skipping new launch."
else
  log "Launching ngrok tunnel..."
  ngrok http ${DEV_PORT} >/tmp/ngrok.log 2>&1 &
  echo $! > /tmp/ngrok.pid
fi
NGROK_PID=$(cat /tmp/ngrok.pid 2>/dev/null || true)
NGROK_PGID=$(ps -o pgid= -p "$NGROK_PID" | tr -d ' ' || echo "")
[ -n "${NGROK_PID}" ] && log "ngrok PID: ${NGROK_PID}"

# ----------------------------------------------------------------------------
# Lifecycle management: cleanup on exit / Ctrl+C and keep foreground active
cleanup(){
  if [ "${CLEANED_UP:-0}" = "1" ]; then return; fi
  CLEANED_UP=1
  log "Cleaning up background processes..."
  # Attempt graceful termination of entire process groups first
  for pg in "${DEV_PGID:-}" "${NGROK_PGID:-}"; do
    if [ -n "$pg" ]; then
      kill -TERM -"$pg" 2>/dev/null || true
    fi
  done
  # Fallback: kill individual PIDs if still running
  for pid in "${DEV_PID:-}" "${NGROK_PID:-}"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done
  sleep 1
  # Force kill lingering groups
  for pg in "${DEV_PGID:-}" "${NGROK_PGID:-}"; do
    if [ -n "$pg" ]; then
      # shellcheck disable=SC2046
      if ps -o pgid= -p "$DEV_PID" 2>/dev/null | grep -q "$pg" || ps -o pgid= -p "$NGROK_PID" 2>/dev/null | grep -q "$pg"; then
        kill -KILL -"$pg" 2>/dev/null || true
      fi
    fi
  done
  # Final sweep individual PIDs
  for pid in "${DEV_PID:-}" "${NGROK_PID:-}"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done
  log "Shutdown complete."
  # Fallback aggressive cleanup if processes still linger and FORCE_KILL_REPO_PROCS=1
  if [ "${FORCE_KILL_REPO_PROCS:-0}" = "1" ]; then
    log "FORCE_KILL_REPO_PROCS=1 set; scanning for lingering Next.js/ngrok processes for project root ${PROJECT_ROOT}" 
    # Find any next or transform processes whose command contains the project root path
    mapfile -t linger_pids < <(ps aux | grep -E "(next dev|next-server|.next/transform|ngrok http)" | grep "${PROJECT_ROOT}" | grep -v grep | awk '{print $2}') || true
    if [ ${#linger_pids[@]} -gt 0 ]; then
      log "Force killing lingering PIDs: ${linger_pids[*]}"
      for lp in "${linger_pids[@]}"; do
        kill -KILL "$lp" 2>/dev/null || true
      done
    else
      log "No lingering project-scoped processes found."
    fi
  fi
}

trap cleanup INT TERM EXIT


# ----------------------------------------------------------------------------
# Obtain public URL via ngrok local API
log "Waiting for ngrok public URL..."
PUBLIC_URL=""
ATTEMPT=0
while [ ${ATTEMPT} -lt ${NGROK_WAIT_TIMEOUT} ]; do
  if curl -s localhost:4040/api/tunnels >/dev/null 2>&1; then
    PUBLIC_URL=$(curl -s localhost:4040/api/tunnels | jq -r '.tunnels[] | select(.proto=="https") | .public_url' | head -n1)
    if [ -n "${PUBLIC_URL}" ] && [ "${PUBLIC_URL}" != "null" ]; then
      break
    fi
  fi
  ATTEMPT=$((ATTEMPT+1))
  sleep 1
done

if [ -z "${PUBLIC_URL}" ]; then
  err "Failed to obtain ngrok public URL within timeout."; exit 1
fi
log "ngrok public URL: ${PUBLIC_URL}"

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
  kill ${DEV_PID} ${NGROK_PID} 2>/dev/null || true
-------------------------------------------------------------------------------
EOF

# Keep script in foreground unless QUIET_EXIT=1 is set.
if [ "${QUIET_EXIT:-0}" = "1" ]; then
  log "QUIET_EXIT=1 set; not holding terminal open. Background processes may die on terminal close unless disowned."
  exit 0
fi

log "Press Ctrl+C to stop dev server and ngrok tunnel. Monitoring processes..."

# Wait until either process exits, then cleanup triggers via trap.
while true; do
  alive=0
  for pid in "${DEV_PID}" "${NGROK_PID}"; do
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
