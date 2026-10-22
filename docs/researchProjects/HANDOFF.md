# Research project library: hand-off

Base: `345e4858b17be1e0535614a5fb3737d0d9aafcd6` on `feat/research-project-library-20261022`.
Status: implemented and **uncommitted**. Only new files under the owned paths. No build, no browser acceptance, no production access, no dependency install.

## Activation blocker (read first)

**Students cannot use this library yet, by design.** Production has no general class enrollment system. The existing legacy seats expired on 11 Oct, and guest sessions belong to a different workshop. The coordinator has not named which existing class should receive the library, so nothing is attached:

- `ATTACHED_CLASS_IDS` in `lib/researchProjects/config.js` is `[]`.
- `REVIEWED_MEMBERS` in `lib/researchProjects/membership.js` is `[]`.
- A signed-in Clerk user who is not an admin gets `403 not_member` from every page and API (tested against the real route modules in `routes.test.js`).
- Request class, group, seat, cookie or header values are never read for access. A Clerk login alone is never membership. Legacy seat accounts are not revived, no cookie path is widened, and nothing is attached to the old workshop class.

**Teachers work today** through the existing admin check (`authenticate()` + `checkAdminPrivileges()`, i.e. Clerk `publicMetadata.role === 'admin'`). A teacher can open every project, preview the simulations and show the answer keys. There are no teams to review until a class is attached.

**Every student-side test uses synthetic accounts, classes and groups with injected membership.** They prove the adapter's rules and the data/UI behaviour. They do **not** show that any real class has been connected.

### The later integration seam (narrow, no new endpoints)

1. Coordinator names the class and the supported source of its membership.
2. Either fill `REVIEWED_MEMBERS` (each entry: Clerk `userId`, `classId`, optional `groupId`, `memberId`, `label`, `reviewedBy`, `reviewedAt`; the loader rejects anything else), or replace `activeMembership` with an adapter honouring `resolve({ userId }) -> null | { classId, groupId|null, memberId, label }`.
3. Put the class id in `ATTACHED_CLASS_IDS`. Both must agree: a mapped student whose class is not attached is still denied.
4. Browser acceptance with real accounts (see below).

## What was built

| Area | Files |
|---|---|
| Pages | `app/class/projects/{layout,page}.jsx`, `app/class/projects/[slug]/page.jsx` |
| API | `app/api/research-projects/{records,actions,keys}/route.js` (thin; logic in `lib`) |
| Server logic | `lib/researchProjects/{access,membership,schema,store,service,http,deps,pageAccess,answerKeys}.js` |
| Client-safe | `lib/researchProjects/{richText,shared,config}.js`, `lib/researchProjects/sim/*` (7 models) |
| Content | `lib/researchProjects/content/*` (7 projects, source register) |
| UI | `components/ResearchProjects/*` |
| Diagrams | `public/research-projects/diagrams/*.svg` (14; generator in `docs/researchProjects/make-diagrams.mjs`) |
| Tests | `tests/researchProjects/*` |

### Pages and gating
- `/class/projects` (tiles) and `/class/projects/[slug]`: `dynamic = 'force-dynamic'`, no `generateStaticParams`, no `generateMetadata`, generic layout metadata (`noindex, nofollow, nocache, noarchive`), no project names in metadata.
- Access is resolved on the server per request. Signed-out, non-member and unavailable states each render one neutral notice that is identical for every slug, so existence is not revealed. Project data is read only after access passes and is passed to the client as props.
- APIs return `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`, `Vary: Cookie` on every response, including errors.

### API
| Route | Who | Purpose |
|---|---|---|
| `GET records?slug` | student / teacher | student: own record (or blank revision 0). Teacher: `&classId` lists teams, `&classId&scope` opens one |
| `PUT records` | student only | save plan, answers, data table, to-do ticks with `baseRevision` (CAS) |
| `POST actions` | `submit` student; `feedback`, `safety_review`, `release_keys` teacher | lifecycle |
| `GET keys?slug` | teacher always; student only if released | answer keys + automatic check of MCQ/numeric answers |

Mutations: `Origin` must equal the request origin (and `Sec-Fetch-Site`, if present, must be `same-origin`), JSON only, 160 000 byte limit.

### Data and scope
- One dedicated collection, `researchProjectRecords` (preview deployments: `researchPreview_<hash>_researchProjectRecords`, chosen only from the server's `VERCEL_ENV`/`VERCEL_URL`, failing closed). Uses `connectToDatabase()`. Nothing is written to any existing class, workshop or student collection (asserted by tests).
- Scope is server-owned: `group:<id>` for a student in a group, else `member:<id>`, always under the mapped class. The record id is a hash of class, scope and slug, so a first save is atomic (duplicate-key means conflict).
- Validation is strict: unknown keys rejected (also `__proto__`), ids must exist in the project, text/row/number limits, numeric strings parsed safely.
- Revisions: `revision` (student edits and status changes) and `reviewRevision` (teacher actions). Every write is compare-and-set; a loss returns `409` with the current record. Nothing is overwritten silently.
- Lifecycle: `draft -> submitted -> revision_requested -> submitted -> accepted`. Submitted/accepted records are locked (`423`). Submit requires all safety items ticked, four plan fields of at least 20 characters, and at least 3 data rows. Measured rows are refused until the teacher records a safety review (simulation rows are always allowed).
- Answer keys live only in `answerKeys.js`, imported only by `service.js`. A student receives them only after (a) the team has submitted at least once and (b) the teacher released them for that team's record. A teacher can withdraw release.
- History: bounded `events` (60), `feedback` (40) and the last 5 submission snapshots. Students see "Teacher" and never teacher ids.

### Student UI behaviour
Load, edit, autosave (1.5 s) and manual save; a status chip with saved/saving/offline/error/conflict/locked/account states; offline edits are mirrored to this browser (keyed by account) and restored after refresh; explicit conflict panel (use the latest, or keep mine and save on top, with a summary of differences); account-switch detection (every response echoes an opaque viewer key and mismatches stop saving); `AbortController` plus epoch guards so slow or stale responses are dropped; quiet refresh on tab focus only when there are no unsaved edits; submit/revise flow; feedback, rubric scores and history; key display on request. Text fields become read-only (still copyable) rather than disabled while locked or in conflict.

### Content
Seven projects: HoloBox digital holography, Bristol TinyLev, MIT RACECAR degraded sensing, range-Doppler radar/SAR, PRANDTL wing twist, ESA CanSat link/tracker, Open-FPM. Each has a research question, prerequisites, four concepts with KaTeX equations, six build steps with labelled original diagrams, equipment and safety checklists, milestones, simulation and experiment tasks, a data table with units and uncertainty, eight questions (2 MCQ, short, 2 calculation, derivation, explain, reflection), a six-criterion rubric, caveats and a source list. Every project states **Published build (what the source describes)** separately from **Proposed student investigation (not a claim that FIT built this)**.

Simulations (pure, deterministic, unit-labelled, assumptions and caveats shown): in-line hologram by angular spectrum; two-cap axial pressure with phase/position errors (Monte Carlo); odometry vs map fixes with slip and dropout; FMCW range-Doppler FFT with SAR cross-range figure; lifting-line (Glauert) with Reynolds number; descent link budget and tracker rates plus a path-loss fit; Fourier ptychography forward model with overlap and reconstruction.

Sources: statuses are in `content/sources.js`. "Read" covers what the integration owner read (`SOURCES.md` and `SOURCE-ADDENDUM.md`, including the Contrail report and the full MIT paper). "Reference" entries (Gabor, Matsushima and Shimobaba, Gor'kov, Glauert, Friis, Zheng et al.) are standard physics citations that were **not opened** for this library, and say so on screen. `racecar.mit.edu` is listed as unavailable (HTTP 502). No third-party images, prices, stock, novelty or DSO claims. The carrier frequencies (24 GHz, 433 MHz) are labelled as examples, not permissions.

## Tests actually run

```
node ../node_modules/vitest/vitest.mjs run tests/researchProjects --maxWorkers=2
```
10 files, **227 tests, all passing** (about 14 s, repo `vitest.config.mjs`, jsdom). Scoped ESLint on `lib/researchProjects components/ResearchProjects app/class/projects app/api/research-projects tests/researchProjects docs/researchProjects`: no errors or warnings.

| File | Covers |
|---|---|
| `access.test.js` | signed-out 401, signed-in non-member 403, forged class/role claims, admin boundary, mapping + attached-class double gate, malformed mapping, fail-closed errors, shipped empty state |
| `routes.test.js` | the real route modules with shipped default wiring (Clerk and DB handle mocked): 401 without touching the DB, cross-origin 403 before auth, default-deny for a signed-in student, teacher key access, no attached class, no static/revalidate hints |
| `api.test.js` | same-origin, size/type limits, malicious/oversized/malformed data, prototype-pollution keys, refresh persistence, group/class/individual isolation, dedicated-collection-only writes and preview namespacing, CAS conflicts, concurrent saves and duplicate first saves (both requests reach the store), account-switch blocking |
| `lifecycle.test.js` | safety-gated measured rows, submit requirements, lock, feedback, revision and accept, history, student/teacher action denial, teacher class boundary, stale review conflicts, key release policy |
| `content.test.js` | 7 projects, every section, question types, published-vs-proposed labels, source honesty, no prices/stock/novelty words, every formula renders in strict KaTeX, no raw TeX in text, diagram files (labelled, titled, `desc`, no scripts or rasters), key shape, keys cross-checked against the simulations and hand formulas |
| `sim.test.js` | each model's units/limits/determinism/hostile parameters and physics checks (NA limits, FFT, textbook radar formulas, lifting-line identities, free-space loss, path-loss fit, pupil overlap) |
| `ui.student.test.jsx`, `ui.teacher.test.jsx` | React UI against the real handlers: content and math rendering, simulation to data row to save, to-do persistence, refresh restore, autosave, conflict choices, offline/retry/error, account switch, stale responses, submit/revise/feedback, key policy, teacher review actions |
| `pages.test.jsx` | server pages: signed-out, non-member, unavailable, member, teacher, 404 after access, static-generation and metadata checks |
| `boundary.test.js` | import-graph check that no client module reaches any server-only module or key text, public folder holds only SVGs, only owned paths, no new packages |

## Not verified (coordinator acceptance)
- `next build`, real Clerk sessions, real Mongo and the browser were not exercised. Confirm in the browser: `Cache-Control` on the dynamic pages (Next sets it for dynamic rendering; not asserted here), KaTeX CSS and fonts in the build, SVG rendering, mobile layout (the status bar is sticky), keyboard and screen-reader behaviour with MathML.
- jsdom cannot compute accessible names across MathML, so a few tests use label/text queries instead of `getByRole(name)`. This is a test-environment limit, not an app issue.
- Real membership, a real class and real admin accounts: none tested.
- Known gaps: no per-user write rate limit (writes are bounded by size, CAS and membership); safety ticks are an attestation, not verified; teachers cannot create a team's first record (the team saves once so the teacher can review); public SVGs are generic, non-protected diagrams fetchable by URL.

## Proposed, not applied: class tab link
Edit `components/class/ClassTabs.jsx` (not in this change's scope): add `{ key: 'projects', label: 'Research projects', href: '/class/projects' }` to `CLASS_TABS`. Visitors who are not authorised land on the neutral notice. Check `tests/classHubPhase1.test.jsx` for assertions on the current tab list.

## Housekeeping
`/docs/` is listed in the repo `.gitignore`, so `docs/researchProjects/` does not appear in `git status`; use `git add -f docs/researchProjects` when committing it (existing docs in that folder were force-added the same way). The other five new trees show as untracked normally.

No existing file was edited. No dependency installed, no `package.json`/lockfile change, nothing committed or pushed. Temporary scratch files (test config, patch scripts, PNG renders) were created only under `D:\Temp\fit-maker-project-library-20261022\scratch-projects` and removed.
