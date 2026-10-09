# Coordinated FIT release validation

This candidate reconciles the validated maker/community checkpoint `b95d5b252756a14e2a7f5085036fce80a3498a12` with canonical production/main `e160d583d2c40e201c38bbc2288a1acc7cd0f637`. It preserves all 18 newer commits, including the Sheet/shop minimum stock policy, cart delivery defaults, authentication, security headers, classroom fixes and maintenance controls. The historical checkpoint evidence remains in `BATCH-READINESS.md` and the parent directory bundle.

## Integration corrections

- Public playground and maker/community pages respect the existing maintenance gate. Exact public routes still preserve unrelated onboarding protection.
- Community models disable automatic collection creation and automatic indexes. A public GET performs no collection/index creation. The first authorized write explicitly establishes required indexes using existing permissions.
- Maker Tools catalogue fixtures now exercise the actual historical Sheet/shop evidence, separate spool/refill availability, a falling shop cap, zero stock and unavailable snapshot claims. Production stock selection logic is unchanged.

## Validation on this source

- Full regression and configured coverage gates: **3491 tests / 330 files**, zero failures. Completed 2026-10-09T17:35:28.638Z. Receipt: `../receipts/release-e160-corrected-receipt.json`.
- Complete default Next production build: exit 0. Receipt: `../receipts/e-node22-full-default-release-e160-corrected-receipt.json`.
- Whole-repository lint: zero errors / 28 existing warnings. Receipt: `../receipts/release-e160-corrected-lint-receipt.json`.
- Actual owned Mongo lifecycle: **13 checks passed**, including empty public GET leaving collections absent, concurrent idempotency, indexes, ownership, admin authority, privacy, moderation, reports, revisions and persistence. Receipt: `E:\Codex-FIT-community-20261009\receipts\community-mongo-d7e1fc86-21ac-4e6e-bdc9-fa71593cdae4/receipt.json`.
- Prior actual browser evidence remains applicable to unchanged feature UI: 12 community UI checks / 35 local API requests, plus the Maker Tools and playground builders' separate evidence. No claim of production account saves or moderation writes.

All local checks use synthetic identities and owned local data. Provider credentials are stripped from build/regression wrappers. The Mongo fixture stops its owned process and drops only its owned database.

## Production readiness and boundaries

Read-only production Mongo metadata confirmed that the three new collections are absent and the existing principal has find/insert/update/createCollection/createIndex permissions. No grants, collections, indexes, migrations, seeds or customer records were changed by preflight. Complete Upstash configuration exists in production/preview, but Secret values are intentionally unreadable. Live service health must be verified through the candidate's ordinary public feed, without extracting those values.

A separate authenticated production repair readiness URL was blocked by the browser (`ERR_BLOCKED_BY_CLIENT`). That route was stopped and remains untested; no alternate access path was used. A normal public preview is a distinct candidate validation step and must stop if its own access is denied. No protection bypass grants or credentials are authorized.

The release still requires exact-commit CI, candidate preview health, a fresh main-head check and confirmed production deployment identity. Keep existing maintenance settings unchanged. No live payments, orders, enquiries, customer/owner communications, public test posts, private account record writes or unverified photography are part of release testing.

The earlier commerce audit gaps remain separate: notification identity/delivery, STEP conversion, approved repair charges, creator smart replies and fleet telemetry. Source feature limits and official references are recorded in the existing readiness files.


## Subsequent main reconciliation

Canonical main advanced to `5b309ac2290f3d45ddf0651aedacc40f2434f4f6` during candidate CI. Its six additional commits are preserved, including the gated homepage, shared bounded Edge Config read, conditional confirmed facts, compressed social image and Singapore function region. No flags, credentials or infrastructure settings were changed by this integration.

The merged source passes 226 focused homepage/maintenance/route/stock tests (12 files), a fresh complete production build, and whole-repository lint (zero errors / 28 existing warnings). Receipts: `release-5b309-home-maintenance-receipt.json`, `e-node22-full-default-release-5b309-integrated-receipt.json`, and `release-5b309-integrated-lint-receipt.json` in `../receipts`. Full regression/coverage for the new exact merge commit is delegated to the existing GitHub CI workflow before production publication; the earlier 3491-test local result is evidence for its predecessor, not the updated source.

The predecessor preview `dpl_9PTWwrX7bwsh6BcNfWP1mxFFqFKm` at `https://fit-website-p3zzfd0p3-fit-admins-projects.vercel.app/community` reached "No published posts yet" through the actual service path. This verifies the configured preview database and rate-limit service without writes to community records. Preview Clerk authentication rejects the preview hostname because the configured production keys allow only `fixitoday.com`; no origin grants or credentials were changed. Production-domain authentication remains a post-deployment check.

The production middleware alert was investigated separately in `../INCIDENT-20261009.md`: platform-resolved 50-response scanner-like burst at 17:05–17:10 UTC, before the 17:16 readiness check; five unauthenticated public endpoints returned 200 at 17:34 UTC, and maintenance reported inactive with `source:ok`. No rollback was performed. The separate missing-image `/api/proxy` log remains outside this feature release.
