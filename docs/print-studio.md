# Print Studio

The print-request page accepts local STL, OBJ and 3MF files, or public design links. It measures and renders the actual file before requesting a price preview. Saving requires sign-in. Creator requests retain their own material catalogue and pricing; the creator confirms their final quote.

## Customer flow

1. Open `/prints/request` or a creator's `?creator=` link.
2. Paste a design link or choose a file. A public page with multiple downloads presents a file choice. A restricted source retains its source link and explains how to upload the file instead.
3. Preview the geometry, choose colour, and optionally select Normal, Strong or Appearance. The default is balanced. The FIT estimate updates from server pricing before sign-in.
4. Sign in through the modal and save the model. FIT requests continue into the print editor. Advanced settings remain available and are retained when their panel closes or colour changes. Creator requests go to the customer's print-request list for the creator to review.
5. For FIT requests, save an authoritative quote or request manual review. The server remeasures the stored file, uses saved settings, and rejects stale or paid-job changes. Creators confirm their own quotes and arrange payment directly with their customers.

## Presets and interpretation

| Purpose | Layer height | Walls | Infill |
|---|---:|---:|---:|
| Default / Normal | 0.20 mm | 2 | 20% |
| Strong | 0.20 mm | 4 | 40% |
| Appearance | 0.12 mm | 2 | 20% |

More walls and infill add material. Finer layers improve vertical surface resolution and usually require more printing time. These settings do not certify mechanical strength or printability. Orientation, material, geometry, bonding and the actual printer profile still matter.

STL and OBJ have no reliable unit declaration and are interpreted in millimetres. OBJ is treated as Y-up; STL and 3MF as Z-up. glTF uses metres and Y-up. Declared 3MF units are normalised once. Source geometry is preserved; the viewer uses a clone for positioning, lighting and surface shading. Its visible layer pattern is approximate, not a sliced toolpath or proof of manufacturability.

## Link import

The implementation uses bounded public HTTPS requests and validates the downloaded bytes. It never forwards browser cookies or bypasses login, payment or anti-bot gates. See `lib/modelImport/README.md` for response contracts, evidence and provider limitations.

- Link import: maximum 4 MiB per model, appropriate for the serverless response limit.
- Local upload: maximum 25 MiB.
- Public page scanning: maximum 2 MiB; limited redirects, requests and processing time.
- Production requires `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Imports return a clear unavailable response if enforcement is missing or fails. Confirm trusted proxy-header handling before enabling `TRUST_PROXY_HEADERS`.
- Creator/source attribution is saved with the request and appears in operator views. It is provenance supplied by the customer, not proof of a commercial licence.

Live checks on 23 September 2026 successfully imported a public STL from the Three.js example repository. The sampled MakerWorld, Printables and Thingiverse design pages required upload fallback. Universal automatic download from those providers is not established.

## Quote and file integrity

Anonymous previews use browser measurements with server-owned prices. Saved instant quotes require a supported, successfully parsed stored model, use saved settings, and reject stale updates. Malformed or unsupported 3MF assemblies require manual review. Paid requests, payment-linked requests, creator-priced jobs and fixed-price product jobs cannot be repriced through the FIT custom quote path.

Model loading normalises declared units and model axes consistently on browser and server. Archive entry counts, expanded sizes, actual decompression and geometry references are checked before untrusted 3MF data can produce an authoritative price. Deterministic mesh names retain saved part colours after reload.

Failed submissions reuse the same draft request. Automatic deletion of an upload after an uncertain save response is intentionally avoided: the server might already have attached the file. Unattached objects need an operator audit or a separately configured storage lifecycle. No lifecycle policy was changed by this release.

## Verification and release

Run the existing Vitest suite and production build with the configured test services. Local preview scripts exercise the actual React and WebGL components:

- `node scripts/preview-print-flow.mjs` serves port 4318, `/flow.html`. Import downloads and quote calculations are real code; identity/storage are explicit local simulations with sample pricing.
- `node scripts/preview-print-studio.mjs` serves port 4317 and displays an original bracket fixture through the production viewer.

These scripts bind to localhost and are development tools, not production services. Stop them after reviewing. The screenshots are not evidence of deployed authentication, S3 or payment integration.

Before release, configure the existing database, Clerk, S3 and billing providers, Redis enforcement, upload CORS and deployment authentication. Complete real test-environment checks for model upload/readback, signup return, quote persistence, creator routing and payment locks. Benchmark supported models against slicer results and actual material/time costs before relying on quotes for operating margins.

The UX reference was [Additive Inn's instant quote tool](https://www.additiveinn.com/3dprint): model first, immediate price, then order. FIT uses its own implementation, presets and visual design.
