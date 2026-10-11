# FIT business reports and owner alerts

This feature is disabled by default. Shipping its source does not activate capture, delivery or scheduled reports. It adds no prices, stock, taxes, payment actions, customer communications, tracking cookies or printer permissions.

## Recorded activity

- Paid orders are captured after the verified Stripe transaction commits. Repeated Stripe events reuse the same analytical event and owner notification.
- Submitted bulk-filament, guided/configured print, repair and fabrication enquiries are captured after source persistence. Upload drafts and shop-generated print fulfilment jobs are not new enquiries.
- Saved order/enquiry status histories feed the ledger. New bulk, repair and fabrication transitions are written atomically with their source change, preserving intermediate transitions through an outage. Note-only edits do not invent transitions.
- The Stream webhook verifies its signature's boolean result before persistence. New customer messages enqueue owner email and Telegram alerts. Owner/admin/silent messages and edits do not alert the owner. Message edits use the committed update time and deduplicate provider retries.
- Existing bulk and repair owner emails keep their existing delivery/retry paths. Their provider outcome is observed by the ledger; this feature does not resend them. Their existing admin panels remain the place to review/retry those emails.

The new ledger stores only event IDs, source/reference, timestamps, status and gross paid amount/currency/item count where applicable. No contact information, chat body, IP, visitor identity, card information or credentials enter the analytical ledger or exports. Paid-alert preparation snapshots contain the contact and item instructions needed by the owner; they omit card brand, last four digits and expiry. Saved Stripe references remain in the owner preparation email. Missing/inconsistent preparation snapshots produce an explicit staff-review alert instead of fabricated instructions or a missing paid count.

## Delivery and recovery

`businessNotifications` is a durable immutable outbox with atomic claims, deterministic email Message-IDs and four total attempts. Explicit temporary rejection is retried with backoff. A transport timeout, crash after claiming, or unknown provider acknowledgement is **uncertain** and is never automatically replayed. Provider acceptance does not establish inbox placement or reading. The admin panel allows a bounded manual retry of known failures; it deliberately refuses accepted/uncertain outcomes and corrupted snapshots.

Capture failures do not roll back source orders/enquiries. Hourly recovery scans persisted source records using timestamp-and-ID cursors (100 rows per source per invocation). Summaries wait while source recovery has a backlog. Stream relies on signed provider webhook redelivery when capture fails; it cannot reconstruct messages never delivered to the webhook. The existing participant courtesy-email path is unchanged except avoiding a duplicate owner courtesy email when the new owner queue is enabled. Its customer-recipient delivery is outside this feature's retry guarantees.

Owner destinations are fixed email `fixittoday.contact@gmail.com` and a configured private Telegram destination verified before every send against `wentoAssistant_bot`. A queued Telegram message is bound to its original chat ID. No `getUpdates`, webhook configuration, OpenClaw configuration, pairing, bot permission, polling or bot restart is performed.

## Report timing and analytics

Reports use half-open Singapore calendar periods (`Asia/Singapore`, UTC+8). Default delivery becomes due at 08:00 Singapore: daily, Monday weekly, and the first day of each month. GitHub's hourly scheduler is best effort; due time is not a guaranteed delivery minute. Cursors catch up missed periods, at most one per cadence per invocation. The first report includes the calendar period containing activation and explicitly marks partial coverage. Pre-activation periods do not create an alert flood.

Reports show recorded paid orders, purchased item units, gross amounts separated by currency, submitted enquiries, chat messages and recorded status changes. These are not profit/net revenue; refund money and currency conversion are never inferred. The existing consented PostHog source supplies aggregate visitors, pageviews, device/country/referrer/page counts. Visitors who decline analytics are absent. Provider pagination is bounded and marked partial, and provider failure is shown as unavailable, never zero traffic. Raw analytics records are not retained by this feature. Saved email reports are immutable snapshots; refreshing the admin panel recalculates from the current recorded data.

Retention applies only to new collections: analytical events 366 days, owner notification snapshots 90 days. Original orders, messages, enquiries and existing configuration are preserved. Aggregate `businessReports` and cursor state contain no customer bodies or contacts. Periods beyond event retention cannot provide complete historical counts. More than 50,000 events per period requires a narrower report; exports can paginate up to 1,000,000 records without silently publishing a partial result.

## Access and E-drive exports

`GET /api/admin/business-reports` requires the existing server-side administrator role. Retry POST also requires the same origin. Browser CSV exports cap at 2,000 events and return an explicit error above that limit; summary JSON is also available. Use Save As to choose an E-drive location.

For complete exports, the private paginated endpoint permits the **existing** `CRON_SECRET` only for `download=page.json`. It does not grant admin UI access or permit notification retries. The exporter refuses redirects, fixes its period anchor across pages, excludes private fields again, escapes spreadsheet formulas, and writes a fresh directory with JSON, CSV and SHA-256 receipts. A failed/mismatched page never publishes an incomplete export as complete.

With the existing scheduler credential already supplied securely to the current process environment (do not put it in a command, log or file):

```powershell
node scripts/export-business-records.cjs daily E:/FIT-business-records
node scripts/export-business-records.cjs weekly E:/FIT-business-records
node scripts/export-business-records.cjs monthly E:/FIT-business-records
```

An optional fourth argument is an ISO UTC anchor, for example `2026-10-11T02:00:00Z`. This selects the preceding completed Singapore calendar period. Automatic saving to a physical E drive requires this computer to be running; no unattended Windows task or stored local credential is created by this change.

## Activation and release boundary

Existing production Gmail, Mongo, PostHog and `CRON_SECRET` are reused. The release owner must review and approve the production configuration and secret distribution before enabling:

1. Set `FIT_BUSINESS_NOTIFICATIONS_START_AT` to the agreed activation instant (ISO UTC); do not backdate casually.
2. Reuse the existing bot credential as server-only `FIT_TELEGRAM_BOT_TOKEN` and bind `FIT_TELEGRAM_CHAT_ID=266599973` only after approving its use by FIT hosting. Do not create a new token or change bot permissions/pairing/webhooks.
3. Set `FIT_BUSINESS_NOTIFICATIONS_ENABLED=true` only when both delivery channels and identity checks are ready. A wrong/missing Gmail sender or Telegram destination fails closed and records non-delivery.
4. Merge the hourly `.github/workflows/business-notifications.yml` and verify the existing repository `CRON_SECRET`/`CRON_BASE_URL` match production. The allowed base is `https://www.fixitoday.com`. Neither repository-secret availability nor a new scheduled run is established by a local test.
5. Smoke the actual authenticated admin session and authorized synthetic live delivery, then inspect due reports. Do not create a real customer order or charge as a test.

Rollback by disabling `FIT_BUSINESS_NOTIFICATIONS_ENABLED`; existing bulk/repair notifications and customer flows continue. Preserve all outbox states. Review uncertain sends before any later manual reconciliation; never bulk-reset them to pending. The previous owner-digest mechanism stays disabled.

## Reproducible checks

New unit/integration regressions are `tests/unit/business*.test.{js,jsx}` plus the bulk route status-history tests. They cover activation, half-open dates/month/year boundaries, retries/uncertainty, duplicate and concurrent claims, provider identity, source recovery, signed webhook rejection, administrator/CSRF boundaries, visitor privacy/pagination, exports and React state changes. Existing full tests/coverage and Next build are required in addition. Local acceptance harnesses and live synthetic receipts are supplied with the E-drive handoff rather than committed with provider configuration. Local browser auth is a fixture; it does not substitute for a production Clerk sign-in test.
