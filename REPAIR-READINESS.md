# Repair assessment integration: local release candidate

This candidate imports the existing repair intake from `fix/shop-option-presentation-20261008` at `1c5689606de0058bac61e0e8bd1625b2f8cf715d`, verified in the owner's original clean checkout. It is staged only in `audit/print-repair-readiness-20261009`, on top of the already validated print fixes in `1d3d77fddaeb5dd33c741f801861f57bf23bdcee` and production base `d5014c17df8cdb5c119c8b7c7f644e5a9f4f8c43`. The classroom owner confirmed no overlap and no publication in progress. No deployment is authorized or performed by this work.

## Concrete behavior

- `/printer-repair` provides a three-step signed-in assessment request: printer, symptoms and checks, optional photos, contact and review. The existing candidate validates brand/model/feeder combinations, bounded plain text, contact data and preferences. It does not diagnose or promise a repair.
- `/api/printer-repair` creates and recovers an immutable brief using an account-scoped idempotency key. Duplicate requests recover the same receipt; altered replays conflict. Owner-only detail and withdrawal are under `/api/printer-repair/[requestId]`. Requests have no price, booking, order or payment.
- `/admin?tab=printerRepair` provides an existing-admin-only queue, filters, cursor pagination, private triage and owner-email status/retry. Regular customers, creators and Pro membership do not acquire admin rights. Existing access/entitlement modules are unchanged.
- Minimal links from home, shop, the repair article, company programmes and the research-services hub reach the intake. Existing classroom and print-delivery behavior is preserved.
- New enquiries save a pending owner-email state with the request. A majority-write atomic claim protects concurrent sends. Only an explicit admin action retries definite failures or unavailable configuration, up to three transport attempts. Unknown SMTP outcomes and stale send claims are not resent. Accepted means provider acceptance, never confirmed inbox delivery. There is no cron, queue drain, legacy backfill or automatic retry of failed alerts.
- Owner email uses the existing FIT destination `fixittoday.contact@gmail.com`. It begins with customer, phone and handover context, then exact submitted assessment details and remarks, followed by explicit no-payment/no-Stripe information. No customer email or Telegram message is sent by this feature.

## Dependencies and deployment review

Vercel environment-name/target metadata was read with `decrypt=false` on 9 October 2026 at 14:17 UTC. Production entries exist for MongoDB, Clerk, Upstash and Gmail. Values were not read; existence does not prove working credentials, database grants or delivery. The endpoint's readiness check reflects configuration presence, not a full provider health probe.

The app needs the existing Mongo principal to read/write a new `printerrepairrequests` collection and create these model indexes through the ordinary app path: unique `requestId`, unique `(customerUserId, clientRequestId)`, and `(status, createdAt)`. Notification state is embedded in that same request; there is no separate queue collection or migration. Actual indexes and concurrency were verified only in a new local Mongo database. **Production collection/index permission and rollout must be reviewed with the batched application deployment; no production schema/index command was run.** If the existing principal lacks access, stop and seek specific permission rather than granting it.

Optional photos reuse `/api/fabrication/assets`, actual decoding/re-encoding, ownership checks and a private S3 bucket. `FABRICATION_S3_BUCKET_NAME` is absent from the checked production configuration, so the interface disables uploads and permits text-only requests. Do not substitute the public shop bucket. Enabling photos later needs an approved existing private bucket with all public-access blocks verified and existing GetBucketPublicAccessBlock/PutObject/GetObject permissions, or a separately approved storage/permission/cost change. This pass provisions nothing.

The existing installed Redis SDK is used with complete Upstash or Vercel KV credential pairs. Partial pairs never mix, distributed failures remain closed, and diagnostics use fixed categories without URLs or tokens. No Redis service or credential was created. Existing Gmail is reused. All local transports were captures, and external HTTP was disabled in the real-Mongo harness.

## Blocked or deliberately unrun

| Area | Status and next requirement |
|---|---|
| Approved-charge repair quotes | No approved repair charge catalogue was found in the inspected application source; the intake's quote handoff is unpriced. Obtain owner-approved service/parts charges, price basis, tax wording, callout/handover terms and approval rules before implementing versioned quotes. |
| Optional repair photos in production | Disabled: private fabrication bucket configuration absent. Local ownership/validation tests pass; no production S3 upload or policy change occurred. |
| Actual owner-email receipt | Unrun. The exact destination is `fixittoday.contact@gmail.com`. Before any canary, report one clearly labelled synthetic owner-only message with a unique reference and no customer data/payment links, and obtain the required parent/user approval. Do not drain pending requests or use actual customer records. |
| Telegram | No Telegram entries were present in the checked project configuration; destination identity is unverified. Do not guess a chat ID, install credentials, or send a test. |
| Creator-print alert retry | Existing creator-print email/chat remains best effort. The new guarded retry applies to repair-owner alerts only. A separate persisted event design must preserve creator/customer destinations and plan boundaries. |
| STEP/STP | Still rejected. A CAD parser, unit/assembly handling and resource/security limits are a separate feature; accepting an extension alone does not provide quotable geometry. Prior STL/3MF geometry receipts remain valid. |
| Live browser/production E2E | Unrun: earlier browser route was blocked; it was not retried or bypassed. Component interaction tests and local route/database lifecycle are the evidence, not authenticated live-browser verification. |
| Payments, real orders and customer messages | Unrun and unchanged. No card charge, customer order, customer communication, production database mutation, credential grant or paid resource operation occurred. |
| Fleet management and smart replies | Separate planned scopes. Fleet needs owned printer records, status/maintenance history and job assignment. Smart replies need relevant request context, editable drafts and human send control; neither should invent rates, availability or commitments. |

## Reproduce locally

Use the existing Node 22.23.3 runtime and dependencies. The external `run-check.cjs` runner removes provider environment variables, uses a separate temporary directory and writes unique receipt labels. From the audit root:

```text
node run-check.cjs tests new-repair-label tests/integration/printerRepairBackend.test.js tests/integration/printerRepairReadiness.test.js tests/unit/printerRepairOwnerEmail.test.js tests/unit/printerRepairAdminUi.test.jsx
node run-check.cjs coverage new-full-label
node build.cjs default new-build-label
```

From the repo, `node scripts/check-repair-lifecycle.cjs <existing-mongod.exe>` runs actual routes/validation/Mongoose against its own verified empty loopback Mongo instance with captured email. Authentication, distributed rate limiting and private-photo provider boundaries are synthetic. It verifies persistence after reconnect, concurrent idempotency, owner-only records, admin permissions, safe retry concurrency, ambiguous-outcome quarantine and withdrawal. It drops only its own synthetic database and stops its own process. No dependency installation is required. The earlier print lifecycle and geometry fixtures are retained separately.

## Release sequence

1. Review this repair scope together with `1d3d77f`, including ordinary new collection/index creation, text-only photo behavior and the real-send approval boundary.
2. Reconfirm main and classroom ownership, integrate both commits once, and run exact-commit release checks. Preserve classroom Submit, print delivery, public pricing, future student verification, one shipping selection and Free/Pro restrictions.
3. Publish one coordinated batch only when the parent assigns it. Verify public intake/config and authorized dashboard access. Production functional submissions and notification canaries remain separate explicitly approved actions.
4. Follow with approved-charge quoting, verified private attachments/Telegram, creator notifications, STEP, smart replies and fleet in separately bounded scopes. No add-ons, paid resources, new grants or spending changes are proposed as implicit prerequisites.
