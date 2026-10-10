# Combined FIT maker/community batch — validated source, unpublished

Base: `9886ab00da3d9adb71f1eec8e935b0104c45ab06`. Isolated branch: `feat/maker-community-batch-20261009`.

## Delivered scope

The batch adds four usable destinations above the released repair/classroom base. It changes no dependencies, subscription terms, shop prices, payments or live records.

| Destination | Implemented | Practical limits |
|---|---|---|
| `/maker-tools` | 30-colour official PLA Basic reference matcher; mass/length/deposited-volume estimator; private manual inventory save/reload/JSON export; multi-colour shortage planner | Approximate screen colour only. Manual input, not slicing or measured consumption. Verified catalogue is PLA Basic 1.75mm/1kg only. No stock reservation, automatic purchase, printer OAuth or telemetry. |
| `/maker-tools/playground` | Six original UNO/ESP32 lessons; local editing/save/reload/INO export; bounded source-driven pin/button/delay/Serial trace | Educational subset, not a C++ compiler, hardware emulator, flasher or electrical simulation. No cloud draft sync. |
| `/community` and `/community/[entryId]` | Questions/projects, topic filters, private My submissions, edits/withdrawal, moderated comments and reports | All new posts/comments/edits remain pending until an existing FIT admin approves. Human moderation is required. No uploads or outbound notifications. |
| `/guides/3d-printing-problems` | Four symptom/cause/safe-next-step sections, model-specific official references and repair/community links | Source-backed text only. No unverified photo, diagnosed case claim, generic disassembly procedure or invented temperatures. |

The existing admin dashboard gains Community Review. Server checks enforce admin authority, ownership, same-origin writes, bounded inputs, rate limits, CAS revisions and idempotency. Public DTOs omit account and report identity. A hidden/non-public parent hides its comments. Exact public route matchers preserve unrelated account onboarding; only static destinations enter the sitemap and community detail metadata is noindex. The hub links the playground and guide; navigation links Community next to Maker Tools.

## Final validation

- Full combined regression and required coverage: 3283 tests / 313 files, zero failures; exit 0. Receipt: `../receipts/combined-recovered-final-receipt.json`.
- Full default Next production build: exit 0 on corrected source; no real provider credentials, no production database. Receipt: `../receipts/e-node22-full-default-combined-corrected-final-receipt.json`.
- Whole-repository lint: zero errors / 28 existing warnings. Receipt: `../receipts/combined-corrected-lint-receipt.json`.
- Focused sitemap, actual Clerk route boundary and hub navigation: 40 tests passed after correcting the expected static routes.
- Community: 80 focused tests; 12 actual route/store/Mongoose/Mongo lifecycle checks; 12 actual browser UI checks and 35 local API requests. Browser errors: zero. Own disposable database dropped, own HTTP/Mongo stopped, own tab closed and viewport restored.
- Community phone discussion (390px), editor (320px) and guide (320px/1440px) inspected. No horizontal overflow; editor inputs labelled. No axe claim for this community run.

Maker and playground owner evidence is retained separately. Maker owner recorded 3106 tests plus real Mongo concurrency/privacy/persistence and actual React/Navbar browser acceptance. Playground owner recorded 3112 tests, 38 component checks, 11 actual built-Next checks, six zero-violation accessibility scans and 12004 bounded parser probes. These upstream counts are provenance, not additional combined tests.

## Release gates and deferred scope

1. Before the one coordinated publication, inspect the current production/main head. Reconcile any newer changes instead of replacing them, then rerun only the checks affected by that reconciliation.
2. Read-only preflight the existing Mongo principal's permission to create the new `communityentries`, `communityreports` and `makerInventories` collections/indexes. No production migration, seed or grant has been executed. Check collection/index compatibility if these names already exist.
3. Confirm the existing complete Upstash or KV credential pair and service health. Community deliberately returns 503 if production rate-limit configuration/provider results are missing or uncertain. The installed Redis SDK supports the KV fallback; partial pairs are never mixed. No new provider/resource/permission is required or enabled here.
4. Keep an existing FIT admin responsible for review. Local tests exercised the actual admin helper with a synthetic Clerk edge. Live Clerk sign-in/sign-up return, real-account inventory save/reload and approved production community persistence remain unrun. Do not create public test posts or external notifications without a separate safe plan.
5. Preserve the released repair/classroom behaviour. This batch does not resolve the prior commerce audit's live notification identity/delivery checks, STEP conversion, approved repair charge catalogue, smart replies or fleet telemetry gaps.

The text guide is independently shippable. The candidate feeder image (`libfile_52bb65ae35788191a7a3cc651f9e8f6d`, 312x554) has only this verified caption: “Filament-feeding mechanism opened for inspection, showing the rollers, gears and tubing.” It was reported as saved from WhatsApp, with photographer/publication rights/FIT attribution unverified. It is excluded from application assets. A nozzle-blob photo was not found. These photo requirements remain incomplete but do not block the sourced text.

## Diagnostic history

The first combined coverage attempt completed with one sitemap expectation mismatch (3282 passed / 1 failed). Adding the playground and guide to the expected static route list fixed it; 40 focused checks then passed. Initial whole-repository lint found two unescaped apostrophes in the guide, subsequently corrected. One recovery run was intentionally stopped after discovering the existing diagnostic receipts; a later run lost its tool session during a service interruption and left no completion JSON. Read-only inspection confirmed no surviving matching Node/Vitest process before the final recovery run. Previous incomplete/failure logs remain preserved; only the final successful receipt supports completion. An earlier browser process ended without a final receipt; the complete repeat above includes verified cleanup. Browser selector mismatches were corrected from visible DOM state; no security denial was bypassed.

## Reproduction

Use the existing Node 22.23.3 runtime and isolated copied dependencies. From this repository run the parent-directory `run-check.cjs coverage <unique-label>`, `run-check.cjs lint <unique-label> .`, and `build.cjs default <unique-label>` with Node. The wrappers strip provider credentials and write exact commands, exit codes and results under `../receipts`. The final executable source was unchanged between its successful build, lint, browser checks and recovered coverage run; this documentation records those results.

`scripts/check-community-lifecycle.cjs <existing-mongod.exe>` creates only its own loopback Mongo/database, exercises actual routes/store/models with synthetic auth/rate edges, then drops only that fixture database and stops its process. The browser fixture and UI receipt are included in the handoff evidence outside production source; it requires the API bundle generated by that lifecycle runner. No real card, order, customer communication, public post or production record write is part of these checks.
