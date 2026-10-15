# FIT canvas image and instruction update

This bounded candidate starts at production `1f510703958a9ff3f0019b396096f7161e50b082`. It does not include the separate public-learning candidate `fef9514`, change shared authentication/navigation, or import the held teacher candidate. The existing classroom access, individual written drafts, shared-canvas compare-and-swap, retry receipts and immutable submission history remain in use.

## Student and teacher workflow

The responsive canvas keeps eight drawing tools, the board, zoom/Fit and Save/Submit together. More settings are under **Tools & options**. **Focus canvas** has an Exit button and Escape fallback. The drawing coordinate system remains 1600 × 1000.

1. In the correct group and idea, choose **Add image** and select an actual PNG or JPEG, up to 4 MiB. Other formats must be converted, not renamed.
2. Review the local preview. Cancel changes nothing; **Use image in my draft** uploads privately and adds the background without deleting existing annotations or the original lesson reference.
3. Add annotations, choose **Save draft**, and wait for **Saved to class**. Reload only after that confirmation to check the saved result.
4. Choose **Submit drawing** and confirm once. The exact image reference and annotations become the teacher's immutable submitted version. Written answers use their existing separate submission.
5. A new revision can change its background while keeping earlier submissions intact. Removing the uploaded background reveals the retained original lesson reference. Clear removes annotations only.

**ChatGPT drawing & Tinkercad guidance**, beside the canvas, provides editable details and full copyable prompts. It starts from the own group's published idea or own submitted refinement and visible feedback for that idea. Identity/account fields are excluded. A teacher must review free text for personal information. Refreshing the source and rebuilding prompts are explicit actions, so polling does not overwrite edits. There is no AI API call or automatic drawing upload. Tinkercad guidance is manual, asks for measured dimensions and preserves the original project.

The teacher projection `/admin/workshop/instructions` now contains eleven slides. Slides 1–8 are unchanged; slides 9–11 add drawing guidance, manual Tinkercad guidance and the exact upload/save/submit workflow. Existing teacher authorization and projection controls remain unchanged. Full prompts stay beside the canvas, rather than being squeezed onto projected slides.

## Storage and limits

`/api/workshop/guest/canvas-images` uses existing server-authorized guest group access, same-origin writes and seat/group rate limits (5 uploads per seat and 12 per group per minute). Students cannot read another group's images; authoritative existing teacher access can read submitted images. Responses are private/no-store and never accept an arbitrary URL.

Source uploads are bounded while streaming to 4 MiB with a 10-second body deadline. Strict PNG/JPEG framing and Sharp decoding reject corrupt, animated, disguised, oversized and trailing-payload files. The limit is 4096 pixels on either source axis and 16 million source pixels. Orientation is corrected, metadata removed and the preview fitted inside 2048 pixels without enlargement. The canonical PNG preview is capped at 8 MiB. Original source bytes are retained privately; untrusted SVG/HTML and uploads are never executed.

Immutable SHA-256 content keys are scoped by session/group/idea. Image documents use the existing `workshopGuestLessons` collection, `kind: canvas-image`; canvas histories contain only a small validated key/size descriptor. No new collection, database index, credential or environment variable is introduced. Server backups must include image documents as well as canvas histories. History JSON exports contain references, not the original image binary. No automatic asset/history deletion is introduced.

## Reproduction and evidence

From this isolated checkout with existing dependencies:

```powershell
npx vitest run tests/unit/workshop --reporter=json --outputFile=../studio-evidence/unit-workshop.json
node scripts/canvasStudio/check-build.mjs
node scripts/canvasStudio/preview.mjs
```

The preview owns an isolated Mongo database and binds only to `127.0.0.1:45171`. Its portable Windows Mongo executable is explicitly set in `preview.mjs`; adjust that local path on another test host. The fixture replaces only authentication/database boundaries with synthetic actors. Actual routes, validation, Mongo persistence and product components are exercised. It must never be deployed or connected to the production database.

In another terminal:

```powershell
node scripts/canvasStudio/check-browser.mjs
```

For the load run, restart the fixture to obtain clean synthetic records, then:

```powershell
node scripts/canvasStudio/check-load.mjs
```

The load scenario starts 48 HTTP pupil flows together, sharing ten canvases. It verifies individual written drafts, private images, all unique annotation marks, exact teacher submissions, duplicate submits and eight before-write/eight lost-ack disconnects. On conflicts, the script explicitly reads and compares the latest document before appending its known test mark. This is a test decision, not automatic product merging: real pupils must compare drafts when the server reports another save.

Receipts, screenshots and latency distributions are under `../studio-evidence`. Both the small-image run and the final textured-image run are retained. These are local HTTP/Mongo measurements, not 48 browser sessions or a production capacity guarantee. Production network latency, Clerk authentication, Vercel cold starts and distributed rate limits are outside this local benchmark.

To stop only the owned fixture, POST `/__fixture/stop` on that loopback origin with header `x-fixture-control: synthetic-local`; it closes its Vite server and Mongo child. Generated database paths are kept as evidence and must not be mistaken for real student records.

## Coordinated release and acceptance

Release the UI, image route, validator, renderer and gallery together through the sole release owner. Ask pupils to reload saved tabs after release so old JavaScript does not reject the new optional image field. Existing `WORKSHOP_CANVAS_ENABLED` must already permit canvas operation; do not create OAuth grants, alter security settings or expose credentials to activate this feature.

The build uses synthetic configuration and a loopback network guard. It is compile evidence only; do not deploy that generated build. The release owner must build normally with the existing protected configuration.

Before claiming publication, verify the deployed commit/CI and normal teacher authentication. Use a server-owned preview database namespace for a complete synthetic upload/save/reload/submit/gallery smoke check. In production, limit checks to bounded read-only entry, sign-in, teacher-gallery authorization, anonymous/foreign access denial and eleven-slide projection. Do not submit a synthetic drawing into a real group's shared canvas, inspect/export student content, or load-test production.

The worker has not published this candidate. Automatic approval review rejected its status-message request because the original task forbids external messages. That restriction must be explicitly resolved for the release handoff; do not bypass the rejection or start a competing publisher. The release owner's last readable state was idle with an executor connection failure. Parent-provided Claude review is pending and is not claimed complete here.
