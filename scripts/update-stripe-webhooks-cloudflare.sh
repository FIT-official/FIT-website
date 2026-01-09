#!/usr/bin/env bash
set -euo pipefail

# update-stripe-webhooks-cloudflare.sh
# Updates Stripe webhook endpoint URLs to point at a given Cloudflare tunnel base URL.
#
# Reads required env vars from scripts/.env.tunnel (or project root .env.tunnel):
#   STRIPE_API_KEY
#   STRIPE_SESSION_COMPLETE_WEBHOOK_ID
#   STRIPE_DIGITAL_TXN_WEBHOOK_ID
#   STRIPE_SUBSCRIPTION_DELETE_WEBHOOK_ID
#   COMBINE_STRIPE_ENDPOINTS (optional, default 0)
#
# Usage:
#   ./scripts/update-stripe-webhooks-cloudflare.sh
#   ./scripts/update-stripe-webhooks-cloudflare.sh https://example.trycloudflare.com

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Source scripts/.env.tunnel first, then project root .env.tunnel (if present)
for candidate in "${SCRIPT_DIR}/.env.tunnel" "${PROJECT_ROOT}/.env.tunnel"; do
  if [ -f "$candidate" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$candidate"
    set +a
  fi
done

BASE_URL="${1:-https://trance-ethernet-hit-couple.trycloudflare.com}"
BASE_URL="${BASE_URL%/}"

log(){ printf "[update-stripe] %s\n" "$*"; }
err(){ printf "[update-stripe][ERROR] %s\n" "$*" >&2; }

: "${STRIPE_API_KEY:?Set STRIPE_API_KEY in scripts/.env.tunnel}"
: "${STRIPE_SESSION_COMPLETE_WEBHOOK_ID:?Set STRIPE_SESSION_COMPLETE_WEBHOOK_ID in scripts/.env.tunnel}"
: "${STRIPE_DIGITAL_TXN_WEBHOOK_ID:?Set STRIPE_DIGITAL_TXN_WEBHOOK_ID in scripts/.env.tunnel}"
: "${STRIPE_SUBSCRIPTION_DELETE_WEBHOOK_ID:?Set STRIPE_SUBSCRIPTION_DELETE_WEBHOOK_ID in scripts/.env.tunnel}"

COMBINE_STRIPE_ENDPOINTS="${COMBINE_STRIPE_ENDPOINTS:-0}"

update_stripe_endpoint(){
  local endpoint_id=$1
  local new_url=$2
  local label=$3

  log "Updating Stripe endpoint ${endpoint_id} (${label}) -> ${new_url}"

  if command -v stripe >/dev/null 2>&1; then
    # Stripe CLI uses STRIPE_API_KEY when set
    stripe webhook_endpoints update "${endpoint_id}" --url "${new_url}" >/dev/null
  else
    local http
    http=$(curl -sS -o "/tmp/stripe_${endpoint_id}.json" -w "%{http_code}" -X POST \
      "https://api.stripe.com/v1/webhook_endpoints/${endpoint_id}" \
      -u "${STRIPE_API_KEY}:" \
      -d url="${new_url}")
    if [ "${http}" != "200" ]; then
      err "Stripe API update failed for ${endpoint_id} (HTTP ${http}). Response:"
      cat "/tmp/stripe_${endpoint_id}.json" >&2 || true
      return 1
    fi
  fi

  log "Updated ${label}."
}

log "Base URL: ${BASE_URL}"

if [ "${COMBINE_STRIPE_ENDPOINTS}" = "1" ]; then
  log "COMBINE_STRIPE_ENDPOINTS=1: updating only the combined endpoint."
  update_stripe_endpoint "${STRIPE_SESSION_COMPLETE_WEBHOOK_ID}" "${BASE_URL}/api/webhook/stripe" "combined-events"
else
  update_stripe_endpoint "${STRIPE_SESSION_COMPLETE_WEBHOOK_ID}" "${BASE_URL}/api/webhook/stripe" "checkout.session.completed"
  update_stripe_endpoint "${STRIPE_DIGITAL_TXN_WEBHOOK_ID}" "${BASE_URL}/api/asset/transaction/complete" "digital transaction"
  update_stripe_endpoint "${STRIPE_SUBSCRIPTION_DELETE_WEBHOOK_ID}" "${BASE_URL}/api/user/subscription/webhook" "subscription delete"
fi

cat <<EOF
-------------------------------------------------------------------------------
Stripe Webhook URLs Updated
-------------------------------------------------------------------------------
Base URL: ${BASE_URL}
Stripe Session Complete: ${BASE_URL}/api/webhook/stripe
Stripe Digital Transaction: ${BASE_URL}/api/asset/transaction/complete
Stripe Subscription Delete: ${BASE_URL}/api/user/subscription/webhook
-------------------------------------------------------------------------------
EOF
