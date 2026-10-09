# Moderated maker community

This source is prepared for the later coordinated Maker Tools / Community release. It is not a production publication receipt.

## Policy and boundaries

All questions, projects, comments and author edits enter `pending`. Only the existing server-verified Clerk `publicMetadata.role === admin` can approve publication through `/api/admin/community`. An edit removes the previous public version until reviewed again. Withdrawal is terminal in the member interface. Compare-and-set revisions prevent stale edits or moderation from resurrecting withdrawn content or approving a different revision.

Public endpoints return only approved content and a minimal DTO. A hidden/pending/withdrawn discussion also hides its comments. Private submissions are scoped to the server's current Clerk user; no client user ID is accepted. Public maker names are chosen explicitly; account names, email addresses, school/class identities, Clerk IDs, report identities and internal moderation data are never copied into public responses. Classroom and product-review data are separate and unchanged. All content is React-escaped plain text; no HTML, markdown execution, uploaded files, embedded media, automatic links or notifications.

Members can report an approved version for spam, privacy, abuse, unsafe content or another concern. Reports preserve the exact public snapshot, are unique per reporter/entry/revision, and do not automatically hide content. Staff review the snapshot and current content, hide if appropriate, then explicitly resolve the report. Rejection/hiding notes are visible to the author; report details and resolution notes remain staff-only. The last 50 content audit events are retained in each entry; this is a bounded operational history, not an indefinite compliance archive.

## Routes and operation

- `/community`: published questions/projects with topic filters and keyset pagination; signed-in private My submissions, creation, edit and withdrawal.
- `/community/[entryId]`: approved discussion and paginated approved comments; sign-in return is explicitly limited to this local route.
- `/admin?tab=community`: pending/published/rejected/hidden/withdrawn queues plus open/resolved reports. Admin access is enforced again on every API call.
- Member APIs: `/api/community`, `/api/community/mine`, `/api/community/[entryId]`, and nested `comments` / `report`.

The Maker Tools owner supplies shared navigation, exact public middleware exemptions for `/community` and `/community/(.*)`, and only the static community sitemap entry. Release both feature commits together; the standalone community commit intentionally does not edit shared Navbar/MobileMenu/middleware/sitemap files. Discussion URLs are noindex and absent from the sitemap. Navigation and real Clerk matching need combined verification after integration.

## Infrastructure

Two new Mongo collections, `communityentries` and `communityreports`, use the existing database and existing principal. The first write creates ordinary compatible indexes, including unique entry identity, owner/client request identity and reporter/entry/revision identity. No seed, migration, delete, grant or production database command is part of this implementation. Collection/index permissions and compatibility must be checked read-only before a later production release.

Community uses the existing complete Upstash or KV credential pair. Partial pairs never mix. Production fails closed when credentials or provider results are unavailable. Distinct community namespaces provide 60 reads/minute, 5 submissions/minute plus 30/hour, 10 edits/minute, 3 reports/minute plus 10/hour and 30 admin operations/minute. User/IP identities are hashed. Local development uses bounded expiring memory counters. JSON bodies are capped at 32 KiB; title, maker name, content, reports, notes, cursors and revisions are bounded. Same-origin writes are enforced. No paid moderation APIs, new external services or communications.

## Verification and limits

80 focused tests passed: API auth/ownership/CSRF, pending/public transitions, stale revisions, idempotent replay, private report data, parent/comment visibility, pagination, content bounds, rate failures, escaped rendering, account-switch privacy and UI actions. Initial full Next build and changed-file lint passed; merged final source needs its own full suite/build.

`scripts/check-community-lifecycle.cjs <existing-mongod.exe>` runs actual routes, store, Mongoose and Mongo with synthetic Clerk/rate edges and external HTTP disabled. Twelve checks passed: concurrent create/report deduplication, real unique indexes, reconnect persistence, authorization, public DTO privacy, comment approval, snapshot retention, edit/hide gates, report resolution, withdrawal/moderation CAS race and pagination. Only its owned new database is dropped and owned Mongo process stopped. Initial retained failures were a harness alias mismatch: the real local five-per-minute limiter correctly rejected seven of twelve requests. The fixture was corrected; application limits were not weakened.

No production accounts, submissions, messages, permissions, orders, payments or deployments were used. No automated moderation quality claim is made: an existing FIT admin must operate the queue. Harmful/private content remains unpublished unless a human approves it; reports of already-approved content require human action. Live Clerk return and production persistence remain distinct from synthetic local acceptance.

## Combined acceptance result

The delivered Maker Tools navigation, playground and text guide are now integrated. The final combined source passed full coverage, default production build and lint. Actual community browser acceptance also completed with verified cleanup. See `BATCH-READINESS.md` for exact counts, receipts, deferred production checks and diagnostic history. Earlier “needs combined verification” notes above describe the original standalone handoff.
