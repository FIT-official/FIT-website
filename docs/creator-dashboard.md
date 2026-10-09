# Creator workspace

The workspace adds store-scoped orders, private print-file intake and a manual workshop queue. It extends the existing checkout transaction and Order model. The public shop catalogue is preserved.

## Deployment controls

`CREATOR_DASHBOARD_ENABLED` defaults off. Only the exact value `true` enables the new pages and APIs. Write handlers check the flag again. Do not enable real integrations on a preview that shares production credentials.

`CREATOR_DASHBOARD_FIXTURES=true`, together with the main flag, renders synthetic, read-only pages without database, inventory or account queries. This works in local development and Vercel preview; it is ignored on production deployments. Fixture APIs reject requests. The root layout omits account providers and analytics on fixture surfaces. Tracking also omits analytics to keep bearer tokens out of third-party telemetry.

The order webhook extension additionally requires a `STRIPE_SECRET_KEY` with the test prefix and an event with `livemode: false`. Signature verification still uses `STRIPE_SESSION_COMPLETE_SIGNING_SECRET`. Other deployments retain the existing checkout behaviour. Independent creator checkout is enabled only behind this test-payment gate; no payout integration is implied.

| Environment name | Purpose |
|---|---|
| `CREATOR_DASHBOARD_ENABLED` | Default-off workspace gate |
| `CREATOR_DASHBOARD_FIXTURES` | Read-only synthetic pages |
| `FIT_OWNER_USER_ID` | Exclude the FIT house account from public creator results, including legacy records |
| `MONGODB_URI` | Existing database connector; use an isolated test database before integration testing |
| `STRIPE_SECRET_KEY` | Test key required for new order creation |
| `STRIPE_SESSION_COMPLETE_SIGNING_SECRET` | Existing webhook signature verifier |
| `FABRICATION_S3_BUCKET_NAME` | Approved private storage only; no public bucket fallback |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Existing S3 client configuration |
| `GMAIL_USER`, `GMAIL_PASSWORD`, `ADMIN_EMAIL` | Existing mailer; preview delivery restricted to the approved mailbox |
| `NEXT_PUBLIC_BASE_URL` | Correct preview origin for private tracking links in test emails |
| `FIT_INVENTORY_SERVICE_ACCOUNT_JSON` | Existing read-only Sheet reader |

Clerk configuration is inherited from the application. No environment values are included here.

## Access and data

Clerk `publicMetadata.role` is authoritative on the server. Supported roles are owner, staff, creator and customer; legacy admin maps to owner. Staff operations are deferred. The existing store identifier is its Clerk user ID, so a client cannot choose its tenant. `scopeQueryForStore()` adds this identity to creator queries, including lookups by ID. Owner views are unscoped; a “View as creator” request creates an AuditLog row and returns a read-only filter identifier, without changing the session's role.

The catalogue uses `productType: "print"` for 3D prints, numeric category indices and optional names from `PRINT_CATEGORIES`. Creator input is validated against those fields. It does not introduce a string into the numeric legacy `category` field. With the workspace enabled, only owner/creator roles can use product create/update.

Order fields retain existing names: `orderId` is the order number, `userId` is the customer identity and `totalAmount` is the total. SubOrder adds seller ownership, item snapshots and fulfilment history. Payment, sub-orders, queue jobs and the event ledger commit within the existing Mongo transaction. Unique event, checkout, seller and reprint indices provide durable duplication guards; no nontransactional fallback is added.

New models have automatic collection and index creation disabled. Enabled write paths explicitly prepare their collections and indexes before transactions; the tracking-token index is prepared only by the verified test webhook. Importing a disabled dashboard route therefore cannot create its database structures.

The status graph is `paid → in_production → qc → ready / shipped → delivered`, with cancellation where permitted and full refunds handled by the verified webhook. Manual requests cannot set payment states. Partial refund allocation remains deferred. FIT fulfilment is the default; creator status edits require a server-stored `fulfilment: creator` value. No address is returned by the new creator APIs.

Tracking tokens are 16 cryptographically random bytes. `/track/[token]` renders only item names, quantities and status history; invalid tokens call `notFound()`. Dynamic pages refresh every four seconds. Hosted latency still needs measurement.

Status notifications use the existing mailer after persistence. During this slice a message is sent only if the customer address and configured admin mailbox both equal `fixittoday.contact@gmail.com`; other recipients, or absent mail settings, are log-only. Logs omit customer data. Notification delivery is best effort, with no durable outbox or Telegram integration in this slice.

## Private files

Reservations enforce 10 files and 300 MiB per job. STL/3MF allow 100 MiB each; STEP/STP allow 50 MiB. Consent timestamp and notice version are recorded. Filenames are sanitised display metadata; UUIDs form all storage keys.

The real adapter uses only the approved fabrication bucket after the existing runtime Block Public Access check. Direct S3 POST policies bind the quarantine key, exact content type, reserved size and SSE-S3 encryption. Signing uses Node HMAC and the existing AWS SDK credential provider, following [AWS's POST policy format](https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-HTTPPOSTConstructPolicy.html). No new dependency or bucket is created.

Server checks re-read the stored size/type and bytes. STL uses the existing strict binary/ASCII parser. ZIP directory inspection bounds 3MF entry count, expansion size and ratio before bounded inflation, rejecting scripts, unsafe paths and external entities. STEP requires its ISO header and terminator. EICAR matching is a clearly labelled signature stand-in, not full antivirus. Only validated files move from `creator-uploads/quarantine/` to `creator-uploads/clean/`; copying binds the source ETag. Downloads require ownership or owner role and expire after at most 600 seconds.

If the bucket is absent or cannot be verified, local/preview mode uses ephemeral in-memory storage. Mock transfers are capped at 3 MiB per file and 64 MiB total process memory; they do not demonstrate Vercel's large-file bypass. Production refuses this fallback. Both API and UI identify mock storage and the bucket approval dependency.

3MF can provide `Metadata/plate_1.png`. Validated STL files up to 10 MiB get a client-side three.js preview; larger files retain server measurements. Bounding boxes assume STL coordinates in millimetres. Signed tetrahedron volume assumes a closed, consistently oriented surface; it is not a validated mass or price. STEP is flagged for manual conversion. Slicer time/grams and calibrated estimates are deferred.

Application access expires after seven days pending or thirty days clean. Actual storage lifecycle deletion, the proposed ninety-day completed-job schedule, anonymous-access verification and bucket CORS require Chairman approval and hosted checks. ClamAV runs later on the FIT Bridge.

## Workshop and materials

`/admin/creator-dashboard` shows orders and the manual fleet; `/orders`, `/queue` and `/materials` provide owner views. `/dashboard/creator/orders`, `/uploads` and `/jobs` provide store-scoped views. The public tracking route is separate.

Print jobs are created automatically for paid print items and manually by the owner. Assignment uses the in-repo manual printer list. Printing requires a printer; completion moves the linked sub-order to QC; failure preserves the original and creates one queued reprint. Priority sorts first; up/down reorders within priority. Creator job responses omit printer, stock and upload details. Lists are bounded to 200 rows. No physical printer is contacted.

Materials reuse the existing Sheet reader, with an owner-only API. The reader has a read-only OAuth scope. Refresh is on demand and every fifteen minutes while the page is open. Missing credentials produce the existing dated snapshot, clearly labelled. Malformed material rows are reported. The service account's actual Viewer permission remains a deployment check. Reservations, stock mutations and low-stock alerts are not included.

## Local verification

The new targeted tests cover authorization, real Stripe signature generation with dummy credentials, transactional replay/rollback, status transitions, file validation, mock storage ownership/expiry, print queue behaviour, fixture isolation and UI rendering. Database transactions are mocked in memory; they do not establish hosted database performance.

To export synthetic HTML, set `CREATOR_SCREENSHOT_DIR` and run the targeted `creatorDashboardUi.test.jsx` test with two workers. Run `corepack yarn node scripts/preview-creator-dashboard.mjs <directory>` to capture it. The script blocks network access and closes its browser; it needs no server or service credentials.
