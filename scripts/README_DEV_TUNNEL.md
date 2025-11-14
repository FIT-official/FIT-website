# Dev Tunnel Automation

Automates local HTTPS dev environment + dynamic webhook endpoint updates for **Clerk** + **Stripe** using **ngrok**.

## Features

- Starts Next.js dev server (`yarn dev`)
- Launches `ngrok http 3000`
- Retrieves generated public HTTPS URL
- Updates Clerk webhook endpoint `/api/newUser`
- Updates Stripe webhook endpoint URLs (test mode) for:
  - `checkout.session.completed` → `/api/webhook/stripe`
  - Digital transaction completion → `/api/asset/transaction/complete`
  - Subscription deleted → `/api/user/subscription/webhook`
- Optional: combine all Stripe events into ONE endpoint
- Bash + Python implementations

## Files

| File                           | Purpose                                             |
| ------------------------------ | --------------------------------------------------- |
| `scripts/dev-tunnel.sh`        | Bash automation script (fast, minimal deps)         |
| `scripts/dev_tunnel.py`        | Python alternative (if you prefer Python ecosystem) |
| `scripts/README_DEV_TUNNEL.md` | This documentation                                  |

## Prerequisites

1. **ngrok installed & authed**
   ```bash
   brew install ngrok
   ngrok config add-authtoken <token>
   ```
2. **jq** (for bash script JSON parsing): `brew install jq`
3. **Stripe CLI (optional but preferred)**: `brew install stripe/stripe-cli/stripe`
4. **Environment Variables** (test mode secrets):

   ```bash
   export CLERK_SECRET_KEY=sk_live_or_test_from_clerk
   export CLERK_WEBHOOK_ID=ep_2yMeZXH25krrgnNhbzC8ZJMFnEh  # or your actual endpoint id

   export STRIPE_API_KEY=sk_test_12345                     # test secret key
   export STRIPE_SESSION_COMPLETE_WEBHOOK_ID=we_123abc     # stripe webhook endpoint id
   export STRIPE_DIGITAL_TXN_WEBHOOK_ID=we_456def
   export STRIPE_SUBSCRIPTION_DELETE_WEBHOOK_ID=we_789ghi
   # Optional: consolidate events
   export COMBINE_STRIPE_ENDPOINTS=0
   ```

> Get Stripe webhook endpoint IDs: `stripe webhook_endpoints list`

## Usage

### Bash Version

```bash
chmod +x scripts/dev-tunnel.sh
./scripts/dev-tunnel.sh
```

Outputs something like:

```
Public URL: https://f3a1-xx-xx-xx-xx.ngrok-free.app
Clerk newUser Webhook: https://.../api/newUser
Stripe Session Complete: https://.../api/webhook/stripe
Stripe Digital Transaction: https://.../api/asset/transaction/complete
Stripe Subscription Delete: https://.../api/user/subscription/webhook
```

Press Ctrl+C and then manually kill PIDs if needed.

### Python Version

```bash
python3 scripts/dev_tunnel.py
```

## Combining Stripe Endpoints

If you prefer a SINGLE webhook endpoint to receive all events (recommended), set:

```bash
export COMBINE_STRIPE_ENDPOINTS=1
```

Then manage the event routing inside `/api/webhook/stripe/route.js` and include the needed event types in the Stripe dashboard or via CLI (`stripe listen` for local dev only).

## Local Development Alternative (Stripe CLI Only)

If you do NOT want to mutate remote Stripe webhook endpoints each time, you can instead run:

```bash
stripe listen --forward-to localhost:3000/api/webhook/stripe \
  --events checkout.session.completed,customer.subscription.deleted
```

And skip Stripe endpoint mutation in the script by unsetting Stripe endpoint IDs (script will exit on missing IDs, so either export dummy or adapt script).

## Safety & Idempotency

- The scripts **PATCH** existing endpoints; they don't create new ones.
- Clerk & Stripe API rate limits are low-risk for this flow.
- If ngrok already running, script reuses existing tunnel (bash version).

## Troubleshooting

| Issue                               | Cause                            | Fix                                                        |
| ----------------------------------- | -------------------------------- | ---------------------------------------------------------- |
| `Failed to obtain ngrok public URL` | ngrok not started / 4040 blocked | Ensure no firewall; run `ngrok http 3000` manually to test |
| Clerk update 401                    | Invalid `CLERK_SECRET_KEY`       | Re-copy key from Clerk dashboard                           |
| Stripe endpoint update fails        | Wrong endpoint ID                | Run `stripe webhook_endpoints list` to verify              |
| JSON parse errors                   | Missing `jq`                     | Install `jq` or use Python version                         |
| Multiple tunnels                    | Stale ngrok process              | `pkill -f "ngrok http"` before rerun                       |

## Extending

Add more services by appending to the scripts, e.g.:

```bash
# Postman mock server update
curl -X PATCH https://api.getpostman.com/... -H "X-Api-Key: $POSTMAN_KEY" -d '{"mockUrl":"'$PUBLIC_URL'/api/..."}'
```

## Cleanup

When finished:

```bash
pkill -f "ngrok http" || true
pkill -f "next dev" || true
```

## Roadmap Ideas

- Auto-detect Stripe endpoint IDs via name filter
- Write last public URL to `.ngrok-url` file
- Add `--detach` mode with log tail helper
- Validate webhook signatures locally (integration test harness)

---

**Happy building over HTTPS!** 🔐
