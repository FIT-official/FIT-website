# Research project library: hand-off (ten lessons, owner audience)

Base `345e4858b17be1e0535614a5fb3737d0d9aafcd6`, branch `feat/research-project-library-20261022`. Local commits only (no push, no deploy):
`c111f97` original seven-project candidate (227 tests) and `b9529c7` ten-lesson checkpoint; the final commit follows this document.
Nothing outside the owned paths was edited: `lib/researchProjects`, `components/ResearchProjects`, `app/class/projects`, `app/api/research-projects`, `tests/researchProjects`, `docs/researchProjects`, `content/researchProjects/assets` (new, protected) and `scripts/researchProjects` (new). `docs/` is gitignored here, so use `git add -f docs/researchProjects`.

## Activation state and the exact integration requirements

**Shipped state is default-deny for everyone.** `ATTACHED_CLASS_IDS` is `[]`, `REVIEWED_MEMBERS` is `[]`, and `defaultAccessDeps().canReview` returns `false`. No membership is seeded and nothing existing is read or written. Tomorrow's audience is exactly two verified owner accounts (no cohort, no migration), so access now has two independent capabilities in `lib/researchProjects/access.js`:

| Capability | Meaning | Decided by |
|---|---|---|
| personal work | saves answers, data table, to-do ticks, submits, revises | `deps.membership.resolve({ userId })` returns `{ classId, groupId, memberId, label }` AND `classId` is in `deps.attachedClassIds` (here `classId` is just the audience id that scopes records) |
| review | reads records, feedback and rubric, safety review, key release, answer keys, teacher-only files | `deps.canReview(userId) === true` only |

Both owners get personal work. Only the exact FIT admin owner gets review as well. The integration owner must:
1. Bind `canReview` in `lib/researchProjects/deps.js` to the **exact owner resolver** for that one FIT admin identity. **Do not bind it to `checkAdminPrivileges` or to any "is Clerk admin" test**: that would admit every existing admin.
2. Bind `membership` to an adapter over the same owner resolver that returns a personal scope for both owner accounts (same contract as `membership.js`), and put the audience id in `ATTACHED_CLASS_IDS`. Do not add a student cohort.
3. Replace the output of `components/ResearchProjects/AccessNotice.jsx` with the generic blurred skeleton and exact restricted notice (owned by the advanced-classes task). The seam takes an HTTP-style status and must stay free of project data.
4. `lib/advancedClasses`, `components/AdvancedClasses` and the admin view/API were not touched.

UI: `ProjectWorkspace` takes `canReview`, `hasPersonal`; an account with both sees a **My work / Review** switch, one with only one sees only that mode. Viewer keys differ per capability set, and a stale tab is refused (`account_changed`).

## Ten lessons (same durable answer, to-do and data flow)
Seven originals plus 08 to 10 adapted from the content owner's handoff (archive SHA-256 `d053f331…cfc542`, 658195 bytes, verified). Each has a 60-minute plan (`lesson60`, six steps, each a saved to-do item), a research question, published-vs-proposed labels, concepts with KaTeX, build steps with diagrams, equipment and safety checklists, milestones, simulation and experiment tasks, a data table with units and uncertainty, a rubric, sources and caveats.

| Lesson | Questions | Simulation (SYNTHETIC where noted) | Teaching files |
|---|---|---|---|
| holobox, tinylev, racecar, radar, prandtl, cansat, fpm | 8 each | existing seven models, each with a **simulation-first** 60-minute plan; hardware stays conditional | 14 diagrams |
| 08 calibrated vibration sensor | 9 scored (4 MCQ, 3 short, 2 derivation, 18 marks) + unscored reflection | spring-mass ring-down, damping, frequency response, coil emf | diagram, plot, ring-down and response CSVs, blank template |
| 09 visible-light spectrometer | same | slit width, two-line resolution, signal, two-point calibration with held-out check | diagram, plot, calibration and spectra CSVs, template |
| 10 resistor-network tomography | same | 3×3 network solver, blinded hidden edge, SSE ranking, noise and pattern count | diagram, edge list, readings, fingerprints, template |

Provenance kept: SYNTHETIC labels on every dataset, simulation row and download; sources marked `checked` (links checked by the content owner, pages not separately read); OpenEIT is CC BY-NC-SA 4.0 and nothing from it is imported; Public Lab templates are linked, not bundled; hardware routes carry the supplied dependencies and safety limits. Answer keys and teacher-only material for 08 to 10 are in `answerKeysSupplemental.js`. The combined `guide.md`, the teacher key files, `teacher_candidate_scores.csv`, the teacher result plot and the archive are **never** published to students: the plot and scores are role-gated assets, the rest is not served at all.
The new models were checked against the supplied data (`content.test.js`): ring-down and response columns, expected spectra, and all twelve candidate fingerprints and SSE scores (hidden edge 7, SSE 6.57 against 7109.8) reproduce.

## Protected lesson assets
- Files live in `content/researchProjects/assets/{diagrams,projects-08-10}` (31 SVG/CSV). `public/research-projects` no longer exists.
- `GET /api/research-projects/assets?id=<id>`: asset **id** from the strict manifest `lib/researchProjects/assets.js` (never a path; hash-checked on every read; `scripts/researchProjects/asset-manifest.mjs` regenerates it). It uses `resolveAccess`; anonymous gets 401, accounts without access 403, and an unknown or teacher-only id looks like a missing one (404) to everyone without review.
- Headers: `private, no-store`, `X-Content-Type-Options: nosniff`, `noindex`, `Content-Security-Policy: default-src 'none'; … sandbox`, `Cross-Origin-Resource-Policy: same-origin`; SVG inline, CSV as an attachment. Lesson content, tiles and downloads point at these URLs.
- **Deployment requirement (not verifiable here):** a serverless build must trace those files, for example `outputFileTracingIncludes: { '/api/research-projects/assets': ['./content/researchProjects/assets/**'] }` in `next.config.mjs`, which I may not edit. Without it the route answers 503.

## Server-only boundary
Every server module, all `content/*.js` and the asset manifest start with `import 'server-only'`; client components reach only `richText`, `shared`, `config` and `sim/*` (an import-graph test enforces it, including that no key text appears in anything a component can reach). Tests use one narrow line, `vi.mock('server-only', () => ({}))`. `server-only` is not in `package.json` but is installed transitively (`yarn.lock` `server-only@0.0.1`) and Next resolves it; adding it as a direct dependency is the coordinator's call.

## Review follow-ups done
- `readJson` reads the stream and stops at the limit (no `request.text()`), checks content-length first, counts bytes, rejects invalid UTF-8, and runs only after same-origin and authentication, so an unauthenticated upload is never read.
- Review targets (and every field of a review action) are validated before `deps.collection()` is called; an owner's own key request never opens the database.
- No `createIndex` anywhere on a request path (`_id` already owns each record). The collection helper only returns the collection.
- TinyLev: the node curvature of |p|² is labelled a **proxy, not a restoring force, trap stiffness or complete Gor'kov analysis** in the output labels, assumptions, caveats, column, concept, task and question 8.
- Holobox: binning keeps 1024 samples, so the modelled window grows; stated in the output label, assumptions, caveats, task and question 7 (not a fixed-sensor comparison).

## Tests
`node ../node_modules/vitest/vitest.mjs run tests/researchProjects --maxWorkers=2`: **13 files, 326 tests, all passing** (repo vitest config, jsdom/node). Scoped ESLint (`lib/researchProjects components/ResearchProjects app/class/projects app/api/research-projects tests/researchProjects docs/researchProjects scripts/researchProjects`): clean. All synthetic multi-account tests are kept; they inject membership and review and prove rules and flows, not a live connection. New: `assets.test.js` (route, traversal, role gating, integrity), `owners.test.js` (two-owner modes, ordering, bounded bodies, no index), `ui.lessons.test.jsx` (modes, ten lessons' durable flow, new simulations, downloads, tiles), expanded `content.test.js` (requirements, not identical counts), `boundary.test.js` (server-only), `routes.test.js` (shipped default-deny, including existing admins).

### Loopback acceptance (`scripts/researchProjects/acceptance.mjs`) and browser fixture (`browser-fixture.mjs`)
```
node --conditions=react-server scripts/researchProjects/acceptance.mjs               # real portable mongod, 127.0.0.1
node --conditions=react-server scripts/researchProjects/acceptance.mjs --logic-check # in-memory stand-in, NOT Mongo
node --conditions=react-server scripts/researchProjects/browser-fixture.mjs [--logic-check] [--self-test] [--port 4173]
```
They use the actual store, service and HTTP handlers with SYNTHETIC accounts, start only their own `mongod` (data and logs under `<repo parent>/acceptance-data` or `fixture-data`, override with `RESEARCH_ACCEPTANCE_DATA` / `RESEARCH_FIXTURE_DATA`), never read `MONGODB_URI` and stop only that process. Scenarios: anonymous and non-member denial, first-save race with a real duplicate key, stale edits and ten-way write race, cross-account/group/class and forged-scope denial, submit, revision, accept, feedback and key release, protected assets and a bounded body, reconnect and full `mongod` restart persistence, and no other collection or index. The fixture bundles the real components and CSS with esbuild and stubs **only** Clerk (a cookie selects one of four synthetic accounts) and `next/link`; its self-test also executes the real bundle in jsdom against the real server, types, saves and verifies the stored record.

**Executed here:** `--logic-check` acceptance 8/8 passed; fixture `--logic-check --self-test` 10/10 passed (`acceptance-data/acceptance-result.json`).
**Blocked here:** with the real `mongod` 8.0.32 every data directory on this machine's exFAT `D:` volume fails with `NonExistentPath` (tried absolute, forward-slash and PowerShell-created paths), and the brief forbids writing elsewhere. The harness reports `blocked`, not pass (`acceptance-data/acceptance-mongod-attempt-result.json`). Run it where `mongod` can open a data directory (an NTFS path via `RESEARCH_ACCEPTANCE_DATA`).

## Exact checks not run
- Real-Mongo acceptance (above) and the Mongo-backed browser fixture; the jsdom smoke test is not a browser.
- `next build`, production asset tracing (requirement above), real Clerk sessions and the exact owner resolver.
- Browser/headless checks of `Cache-Control` on dynamic pages, mobile layout, KaTeX fonts, SVG and tile image rendering, keyboard and screen-reader behaviour.
- Binding `canReview` and membership to the owners; replacing `AccessNotice` with the blurred skeleton.
- Known gaps: no per-user write rate limit; safety ticks are an attestation; teachers cannot create a first record; teacher PNG assets from the handoff are not included (SVG only).
