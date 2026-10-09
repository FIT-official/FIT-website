# FIT Maker Tools

Local feature candidate for the coordinated release owner. Do not publish independently.

## Delivered behaviour

- `/maker-tools`, linked from desktop/mobile navigation and Shop, with a public sitemap entry.
- Shared Community integration is coordinated with the community owner: desktop/mobile links, a Maker Tools hub link, exact `/community` and `/community/(.*)` public matchers, and only the static `/community` sitemap entry. `/community-private` remains outside the exemption. Release this integration together with the owner's separately built Community destination.
- 30 Bambu Lab PLA Basic reference colours ranked by sRGB → D65 CIELAB → Delta E 1976. Same HEX is explicitly a reference match, not a physical colour guarantee or a confidence percentage.
- Existing exact catalogue identities and reviewed photos are reused. The adapter accepts only the 1 kg PLA Basic product, reviewed colour identity and explicit spool/refill options. It calls stock confirmed only when the existing catalogue supplies combination stock from Sheet/shop; historical snapshots and independent option totals remain unconfirmed. Product links require the customer to select and review the named variant. No checkout or stock reservation occurs.
- Material estimator accepts grams, metres or deposited-plastic cm³, with editable density/diameter, support/purge, copies and reserve. Material cost is optional SGD/kg; print duration is only entered slicer minutes × copies. No geometry, infill or exact duration is fabricated. Estimates export to JSON.
- Signed-in customers maintain up to 100 manual filament records. Add labelled reference/custom filaments, update remaining net grams, remove, save and export JSON. The planner accepts up to 50 project rows and combines repeated colour requirements before allocating on-hand grams. It rounds shortages into 1 kg pack counts and shows packaging alternatives and catalogue availability. Project plans export to JSON.

## Data and privacy

- Existing Clerk `authenticate` and Mongo connection conventions; no new paid dependencies or external integrations.
- New Mongo collection: `makerInventories`. One document per Clerk user ID in `_id`; the built-in unique `_id` index provides ownership storage and concurrent-insert protection. Fields are `spools`, `revision`, `updatedAt`. No migrations or seed writes.
- Every GET/PUT derives ownership from the server session. Query/body owner IDs cannot select another account. Strict fields, numeric bounds, 64 KiB streamed JSON cap, same-origin PUT, and revision-based atomic updates. Concurrent first saves or stale revisions return 409 without overwriting newer data.
- API responses use `private, no-store`, `Vary: Cookie, Authorization` and noindex. Export has no account identifier. Private UI is marked for analytics masking/capture exclusion, keyed by account identity and cancels stale loads on account changes. No local/session storage of private inventory or planner values.
- Reloading saved inventory intentionally discards edits and is labelled accordingly. Save errors retain current edits. Unknown outcomes can be checked by reloading before retrying. Clearing the list and saving removes the saved filament contents.

## Source and licensing review, 9 October 2026

- New HEX facts: [Bambu Lab official PLA Basic HEX table](https://store.bblcdn.eu/s8/default/903b60b06ac142e9b1b49ad53cfa4c82/Bambu_PLA_Basic_Hex_Code.pdf). Only factual colour-name/HEX pairs were transcribed. No PDF, new manufacturer photographs, logo, or marketing copy is distributed by this change.
- Default density: [Bambu Lab PLA Basic technical data sheet](https://wiki.bambulab.com/filament-acc/abs-asa-pc/bambu_pla_basic_technical_data_sheet.pdf), 1.24 g/cm³. It is an editable assumption, not applied to all materials as a manufacturer claim.
- Cross-check: official [Bambu Studio colour metadata](https://raw.githubusercontent.com/bambulab/BambuStudio/master/resources/profiles/BBL/filament/filaments_color_codes.json). Its repository [license](https://raw.githubusercontent.com/bambulab/BambuStudio/master/LICENSE) is AGPL; this change does not copy its code or JSON database. The independently written colour conversion uses standard sRGB/D65/CIELAB formulae; see [W3C colour-conversion reference](https://www.w3.org/TR/css-color-4/#color-conversion-code). No third-party conversion implementation was copied.
- Existing photo assets and product identities retain their prior provenance in `lib/bulkFilamentPreviews.json`; this feature introduces no additional image licences. The existing Blue 10600/10601 discrepancy is shown explicitly. It does not invent a new manufacturer code. `Blue Grey` in the PDF maps to reviewed `Blue Gray` catalogue labels; the reviewed Cocoa Brown label corrects the existing `Coca Brown` catalogue typo.
- Current FIT catalogue was checked through the existing public read-only endpoint. No production database credentials or inventory writes were used.

## Intentional limits

- Matcher and purchase planning cover only verified Bambu PLA Basic 1.75 mm / 1 kg offers. General manual inventory supports other brands/materials, but never substitutes a custom or other-material spool based only on a similar HEX.
- No slicer, printer credentials/OAuth, telemetry, automatic consumption, import/CSV, persistent cloud project documents, inventory reservation, automatic cart, purchase, discount, subscription change or customer/owner notification is added.
- Live stock may change after refresh. Refill requires a compatible reusable spool. Metallic finish, translucency and physical sample matching need human judgement.
- Production Clerk sign-in and persisted production-account writes remain release-owner browser checks. Local acceptance uses a synthetic auth boundary and an owned loopback Mongo database; it is not evidence of live account sign-in. Production resources/configuration are untouched.

## Reproducible validation

- `yarn test:coverage` is the required full regression/coverage gate. `yarn lint` is non-blocking in the repository CI; changed Maker Tools files should lint clean.
- `yarn build` runs the complete Next production build, not compile-only mode.
- `node scripts/check-maker-tools.cjs <existing-mongod.exe>` runs actual private routes against an isolated loopback Mongo process and closes only its own process.
- Add `--browser` after the coordinated browser slot is available. It builds the actual React component into a local acceptance fixture, uses actual inventory API/Mongo, blocks external browser requests, saves screenshots/export evidence and closes only its owned context/server/database. It requires an existing build for global CSS and a recorded public catalogue JSON at `../receipts/public-catalogue.json`; the screenshot stock is labelled as a historical snapshot.
- Evidence receipts live outside the tracked source in `../receipts/`; final handoff gives exact commands, commit and outcomes.

## Shared file ownership for integration

This branch owns `components/General/Navbar.jsx`, `components/General/MobileMenu.jsx`, `app/shop/page.jsx`, `middleware.js` and `lib/seo/sitemap.js`, plus their navigation/sitemap/boundary tests. The Community owner keeps `app/community/**`, Community APIs/models/components and the admin queue. No homepage or admin integration is changed here. The desktop navigation uses normal flex spacing to fit both destinations at 1024 px; the existing mobile menu remains the phone navigation.
