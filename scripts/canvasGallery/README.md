# Unpublished submitted drawing gallery

Base: `9c455d973d6fd093a24b7cb0b94a4ce7ef347d9b`. The gallery reads every immutable `submit` revision, including older submissions whose current canvas head is a new draft. Identical submitted documents remain separate version cards. Draft/fork/restore revisions are excluded.

The additive GET endpoint `/api/admin/workshop/canvas-submissions` uses the existing teacher authentication, canvas feature switch, database collection and private/no-store responses. It returns bounded metadata pages (8 default, 12 maximum), then one validated exact submitted document on demand. It accepts no writes. Twenty fixed canvas IDs and the existing workshop session define its scope. The bounded cursor contains per-canvas head-version ceilings and a numeric group/idea/version position; it cannot authorize access. Authentication is repeated for every request. Explicit Refresh includes new submissions, while Load more retains its prior ceilings.

The UI keeps a two-request visible-preview queue and a per-mount twelve-document LRU cache. Leaving a card cancels its preview; unmount/access loss clears private state and cache. Exact detail responses must match the selected stable submission ID and timestamp. The existing drawing renderer and PNG exporter are reused without changes. The exported filename carries the historical version. Create/refine prompts start with authored placeholders only, edit independently, and copy the displayed text with a manual selection fallback. No external AI service receives any content.

The integration commit mounts this new gallery beside the original TeacherCanvasPanel inside the existing `lesson.canvasEnabled` condition. All 57 protected slides, instructions, original/revised artwork and drawing/write/auth files remain byte-identical. No database migration, credential, OAuth grant, feature-setting change or deployment is performed.

## Local synthetic verification

- `node scripts/canvasGallery/verify-preservation.mjs`
- `node node_modules/vitest/vitest.mjs run tests/unit/workshopCanvasSubmissions.test.js`
- `node scripts/canvasGallery/preview.mjs` starts a fresh owned loopback Mongo database and Vite at `http://127.0.0.1:4391`. It first runs six assertions using the real Mongo aggregations and existing canvas writer. It uses synthetic records only. The current local Mongo executable is declared near the top of the script; replace that local path when using another machine. Stop with Ctrl+C to close the owned database/server.
- While the fixture runs: `node scripts/canvasGallery/check-browser.mjs` exercises the actual components with Chromium and writes twelve checks plus desktop/mobile screenshots to the adjacent `gallery-evidence/browser` directory. All non-loopback requests are blocked. The fixture does not stand in for production authentication; route authorization is tested separately.
- `node scripts/canvasGallery/check-build.mjs` uses synthetic build configuration, a mock font response and the existing loopback-only network guard. It refuses local environment files. Evidence is written outside the repository in the adjacent `gallery-evidence/build` directory. The output is verification only and must never be deployed with these synthetic values.

Release owner must review the two additive commits against current main and run their normal signed-in teacher integration check before any separately authorized deployment. No new setting is required when the existing canvas workspace is already enabled. The old teacher panel, existing instruction paragraphs and slides remain intact.
