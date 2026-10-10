# Prepared owner enquiry/order digests — delivery disabled

This is a local preparation change on the preserved `d5ee781` candidate. It adds no route, webhook call, cron, admin action, credential, environment setting or Telegram destination. Nothing sends or writes notification state in the production configuration.

`lib/notifications/ownerDigestPolicy.js` contains a hard `OWNER_DIGEST_DELIVERY_ENABLED = false`. Environment variables and function options cannot override it. The default-policy test proves both wrappers return `disabled` before any storage read, checkout lookup or mail call. Owner approval and a separate reviewed integration are required before changing this policy.

## Prepared messages

- `buildGuidedOwnerDigest(request)` describes the saved enquiry: customer, available phone, unagreed address/collection, purpose, copies, desired size/units, material/colour, reference/attachment identifier, exact remarks and unverified permission information. It explicitly states no payment, stock reservation or agreed quote/shipping charge.
- `buildPaidOrderOwnerDigest({ checkout, order })` requires a matching committed checkout snapshot and recorded paid order. It checks identity, session, currency and amounts; lists every purchased item, variants, quantity, remarks, print copies/settings/colours, saved file review and recorded finishing options; then gives order/session/intent references, confirmation date, available method/last four digits and exact recorded totals.
- Both send only to the verified existing business address `fixittoday.contact@gmail.com` through the existing `sendEmail` abstraction. No CC/BCC, caller-selected recipient, full payment card information, private S3 URL/key, live cart/product lookup, new rates, stock promises or tax allocation is introduced. Templates escape HTML and reject oversized content rather than truncate preparation instructions.
- All sample customers, prices, addresses and payment IDs in tests are synthetic. The sample paid fixture's S$6.20 delivery and S$40.20 total are not new offers or verified live orders.

Missing data remains explicit. Current paid checkout snapshots do **not** capture `customerPhone`; the new builder supports a future recorded phone but reports `Not recorded in this source snapshot` for current records. Guided enquiries do not collect phone or confirm an address/collection arrangement. Do not silently source these from a mutable later profile. An approved follow-on integration must decide whether to snapshot already-provided checkout phone and/or add optional enquiry contact fields; this patch does neither and changes no payment behavior.

## Duplicate-safe dormant delivery

`notifyGuidedEnquiryOwner` and `notifyPaidOrderOwner` accept the existing source record's **native Mongo collection**, not a Mongoose model, plus the stable request/session ID. Paid preparation also receives a server-only recorded-checkout loader. They are not exposed to clients or called by current routes.

If separately enabled after approval, preparation would add an `ownerDigest` field to that one existing enquiry/order, without upsert or a new collection. The first full message and SHA-256 fingerprint are pinned with majority write concern. A subsequent majority compare-and-set claim (also checking source status) precedes delivery. No queue scan, migration, new index, new permission or retrospective send is included.

Only an explicit retry may retry a definite failure or missing mail configuration, with a three-attempt limit. Accepted messages are not resent. Timeout, ambiguous provider outcome, stale in-flight state and lost claim/final database acknowledgements are held for reconciliation, never automatically reclaimed. The deterministic Message-ID is diagnostic, not an SMTP exactly-once guarantee. `accepted` means the provider acknowledged the recipient, not verified inbox delivery.

An eventual approved integration should invoke the wrappers after confirmed enquiry persistence / paid-order transaction commit, including validated recovery paths, using only the recorded source ID. Add narrowly scoped admin state visibility and retry authorization then; no public trigger or broad backlog drain is prepared here. Decide how cancellation/refund races and owner reconciliation are operated. Preserve the default-off gate until that review is complete.

## Validation boundary

Unit tests capture the mail abstraction; delivery tests substitute the policy only inside the test module. A separate default-policy test uses the actual false constant. The real Mongo fixture creates its own loopback database and substitutes an enabled policy only in a generated test bundle; mail stays captured and external TCP is blocked. No browser operation, real message, provider credential or production record is used.

The original `d5ee781` review checkout, bundle and evidence are preserved. No deployment or publication is included. Classroom work and the single-writer release hold remain first.
