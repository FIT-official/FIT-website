# Bulk enquiry allowance correction — 10 October 2026

Base: `fe81618460f39ec57974717c3003bbbf6641f923`.

The bulk enquiry now accepts recorded stock plus 20 through its existing single quantity field. Client and server use the same calculation. Duplicate lines and overlapping product, colour and spool constraints share the allowance, so splitting a selection cannot multiply it. Recorded stock remains unchanged, and the form explains that excess quantities request availability and reserve nothing.

Known zero stock permits an enquiry for up to 20. Missing, ambiguous or malformed source identities remain blocked. Catalogue versions include stock-verification metadata; changed inventory requires review. Saved enquiries retain their canonical quantity, prices, stock evidence and idempotent receipt.

Public price ladders, payment logic, owner email logic, shipping policy, inventory records and credentials are unchanged. Lanbo silk has not been introduced. PETG pricing evidence remains inconclusive, so its existing public ladder is preserved pending explicit numerical confirmation.

## Preview decisions

- The manufacturer [PETG White page](https://www.tyzh.com/?list_66/1175.html) uses a spool photo whose label says PLA. The exact Lanbo/PETG/White/331 identity shows an explicit material-conflict explanation; the photo is not served.
- The manufacturer [PETG Coffee page](https://www.tyzh.com/?list_66/1186.html) likewise shows a PLA-labelled spool. The exact Lanbo/PETG/Coffee/443 identity remains unavailable with a specific explanation.
- PVA's reviewed 0.5kg slug now retains its original White/66400 versus manufacturer Clear conflict explanation. No substitute swatch or image is added.

No new verified photos were found in this correction. Other unresolved previews remain unavailable. Image provenance and inspected SHA-256 hashes are retained in `lib/bulkFilamentPreviews.json` without prices or stock data.

## Validation

- 3,582 tests across 336 files passed; existing coverage thresholds passed.
- Complete Next production build passed with inert credentials and an unreachable local database placeholder.
- All 15 changed executable source/test files linted with zero errors and zero warnings.
- Actual React form and production CSS at 390 and 320 pixels: 14 recorded / 34 requested accepted; 35 blocked; no horizontal overflow; readable quantity, stock and estimate.
- Bambu shared colour boundary: 23 with spool + 5 refill accepted, +6 rejected; list prices remain separate from Lanbo tiers.
- Preview conflict messages verified in the actual form. Browser fixture had submissions disabled and inherited no provider credentials. An initial fixture-only missing `process` shim was corrected before acceptance.

Reproduce unit validation with `yarn test:coverage`, build with `yarn build`, and changed-file lint with `yarn eslint <changed executable files>`. The isolated evidence package contains exact Node 22 commands, timestamps, results and browser fixture sources. No new live enquiry, payment, stock mutation or notification was made.

## Release and rollback

Use the established feature CI then guarded fast-forward main workflow. Preserve this source commit/bundle and deployment receipts. The reported Vercel retention change on 23 October 2026 may remove deployment artifacts older than 30 days: an old deployment URL is not a durable rollback guarantee. Existing source bundles permit rebuilding through the approved workflow. Retention and billing settings have not been changed.
