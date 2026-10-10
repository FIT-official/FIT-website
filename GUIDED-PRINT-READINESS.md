# Guided print enquiry candidate

Base: `da9908655741fdd51fbd74385ec10feebbf00fc1`. Independent local checkout. Do not deploy until the single-writer hold is explicitly cleared and integration is reviewed.

The default `/prints/request` now helps a beginner describe a need, search the existing FIT catalogue, browse external site landing pages, paste a model reference, specify longest-side size in mm/cm/inches and quantity, choose a material/colour preference or ask for help, then send a manual-quote enquiry. Existing creator, saved-request and advanced flows retain their entry points. Customer permission details are optional and collapsed. No legal questionnaire is required to enquire.

The enquiry uses the existing CustomPrintRequest collection, admin queue and account page. It is immutable from customer update/config routes; unchanged retries are idempotent per account. It never becomes an instant per-file quote. Staff must record the exact file/version, evidence permitting the particular paid print, and confirmation of dimensions/units, all copies, material and colour before issuing a manual quote. Cart and final payment handlers enforce that review. Checkout snapshots carry the full batch brief, review and preparation remarks. Existing shop rates, shipping rules and tax terms are untouched.

## Model handling

- Reference links are stored only: no remote fetch, scraper, API guess, embedded third-party site or new credentials.
- Reuses existing private fabrication asset service (3 MB maximum), format checks, ownership and expiring private file links. Missing verified-private storage leaves text/link enquiries available; it does not fall back to the public model bucket.
- Guided local preview supports STL only and explicitly describes the assumed units. OBJ/3MF can be privately attached after the existing server format/archive checks, but are not previewed or automatically quoted by this path. STEP remains unsupported. G-code is rejected, never executed.
- Size is a desired longest side, not a geometry transform. Quantity is a requested batch count, not an automatic per-file-price multiplier. Staff verifies the exact geometry and quotes the complete batch.
- Material/colour selections are preferences. Live catalogue colours are reused when available; no new stock, price, fulfilment time or performance guarantee is invented.

## Important acceptance limits

This is a review-ready local candidate, not a deployed or human-accepted release. Browser/mobile visual smoke is unrun because the authorized browser route is unavailable; it was not bypassed. Production Clerk sign-in return, production private bucket/permissions, authenticated save/reload and actual delivery of owner alerts are unrun. The new enquiry is visible in the existing dashboard; it does not send an owner-email/Telegram alert. Staff quote creation retains the existing customer notification mechanism, exercised only through captured test doubles. No live orders, charges, communications or permission changes were made.

The legacy advanced link importer remains unchanged and needs a separate platform-access/licensing review before extending its use. The new guided flow does not call it. No verified reusable MakerWorld/Printables discovery/embed API is used. External discovery is site-level link-out and manual paste; no external catalogue is represented as FIT-approved. Existing product catalogue listing approval is not newly certified by this feature.

The earlier held shipping correction and photo candidates are separate changes based on recorded source. Do not assume this branch includes them or cherry-pick over competing changes without reconciliation.

## Source references for integration review

- Printables terms: https://www.prusa3d.com/page/terms-of-service-of-printables-com_231249/
- Incorporated Prusa website terms: https://www.prusa3d.com/page/general-terms-and-conditions-of-use-of-the-prusa-websites_231226/
- MakerBot terms: https://www.makerbot.com/legal/terms-of-use/

No blanket legal conclusion is inferred from model availability or free downloads. The internal review records the actual file and applicable permission for each paid job.
