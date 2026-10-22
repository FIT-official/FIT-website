# Maker Tools redesign handoff

Integration-owner review: the actual selected-colour chip was obscured by its fallback checkerboard background image. Changed its valid-colour inline style to `background`, which resets that image, and added an assertion. The 18 UI interaction tests pass after this correction. The independent owner browser rerun passes all seven groups at 390/1024/1440 pixels, with no axe violations, page errors or external requests. Exact source hashes and screenshots: `../evidence/maker/output/playwright-owner-review/receipt.json`. The earlier complete146-test pass remains recorded under `../evidence/maker-correction/tests.json`; other source logic was unchanged by this one-line visual correction. No live authentication, production database write or deployment was tested.

Base 345e4858b17be1e0535614a5fb3737d0d9aafcd6. Nothing committed.

## Changed files
- `components/MakerTools/MakerTools.jsx` – new `ColourInputs`/`Matcher`; slogans, hero art, numbered tabs and eyebrow lines removed; plain headings (Maker Tools, Colour matcher, Material estimator, My filament, Project planner, Learning and help, Community); raw terms removed from copy (JSON, raw stock source, "Combination stock unconfirmed", CIELAB/D65 detail moved to a plain CIE76 note in the "How colour matching works" disclosure).
- `components/MakerTools/MakerTools.module.css` – compact hero, swatch grid, RGB fieldset, selected-colour panel, responsive rules (900px / 540px), error-state borders; unused hero/matcherControls rules removed. Existing `:focus-visible` outline retained. (A few unused `.eyebrow` rules remain, harmless.)
- `lib/makerTools/colourInputs.js` (new) – pure HEX/RGB parsing, conversion, 16-colour named palette.
- `tests/unit/makerColourInputs.test.js` (new) – pure conversion/validation tests.
- `tests/unit/makerToolsColourInputsUi.test.jsx` (new) – RTL interaction tests (swatches, keyboard, HEX/RGB/picker sync, invalid/incomplete input, loading/error/empty/stock filter, planner/estimator regressions).
- `tests/unit/makerToolsUi.test.jsx` – one heading assertion updated ("From HEX to filament." -> "Colour matcher").
- `MAKER-TOOLS-READINESS.md` – one bullet on the new inputs.

## Behaviour
- Swatch, picker, HEX and RGB all write the same selected colour; the selected panel shows swatch name (or "Custom colour"), HEX and RGB.
- HEX accepts #RGB/#RRGGBB with or without `#`, any case; normalised on blur.
- RGB channels accept only whole numbers 0–255 (text inputs, so invalid text stays visible instead of being dropped by the browser). Blank is not 0.
- Incomplete/invalid entry: inline `role="alert"` message, `aria-invalid`, no matches, no planner buttons; the picker keeps the last valid colour and the other field is not rewritten.
- Swatches are `aria-pressed` buttons in a labelled group; selection also shown by check mark and border (not colour alone).
- Stock loading/error/no-match states, qualifications, source link, planner/inventory/estimator logic and shop/community/playground links are unchanged.

## Correction pass (owner review)
- **CSS regression fixed.** When the matcher controls were replaced, the shared `.field`, `.field span`, `.field input/select` (width/min-width/max-width:100%, height, border) and `.field small` rules were deleted by mistake. They are restored verbatim from base `HEAD`, so all four tools' forms are styled again. Added `min-width:0` on the new grid children (`.colourInputs`, `.exactRow`, `.rgbSet`, `.selected`). No overflow is hidden. Every removed rule in the diff against base was checked; the rest are the intentional hero/eyebrow/numbered-tab/old-matcherControls removals.
- **Three test corrections (tests only, no product change):** (1) status line reports all 30 references while 6 cards render; both asserted. (2) The confirmed-stock filter is not a strict colour filter, so a Red target still lists stocked Bambu Green; the empty state is now tested with Refill-only packaging, which has no fixture refill stock. (3) The planner test sets grams on both rows (1000 + 500, 10% reserve, 2 packs).

## Test receipts (actual)
- Vitest, `--maxWorkers=2`, 5 files: **146 passed / 146** (`../evidence/maker-correction/tests.json`, `tests.log`). Files: makerColourInputs (56), makerToolsColourInputsUi (18), makerToolsUi (7), makerTools (55), makerInventory (10).
- ESLint on `components/MakerTools`, `lib/makerTools` and the three maker UI/input test files: exit 0, no findings (`lint.log`).
- Chromium (owned loopback fixture, a copy of the owner's `browser.cjs` writing to `../evidence/maker-correction/output/playwright`; original evidence untouched): `success: true`, no page errors, no external requests. It covers picker/swatch/short HEX/RGB sync, invalid RGB hiding matches, keyboard swatch recovery, **no horizontal overflow at 1440/1024/390**, axe WCAG A/AA scan with zero violations on a phone viewport, loading/error/empty-stock recovery, estimator conversion, and the guest inventory sign-in boundary. Screenshots reviewed: desktop-invalid, matcher-390.
- One change to my copy of the fixture only: its loading-state locator used `'Checking FIT catalogue stock.'` with a literal full stop, but the page text ends in an ellipsis (…), so the locator never matched. It now uses a regex without the punctuation. The original `evidence/maker/browser.cjs` is unchanged, and the owner should apply the same fix when rerunning.

## Remaining limitations
- Only Chromium was exercised; no Firefox/Safari. Contrast beyond the axe scan is unmeasured.
- Typing a valid 3-digit HEX (e.g. `#abc`) on the way to a 6-digit one briefly selects that colour, as it is a valid HEX.
- Swatches are general named colours, not manufacturer references; matches remain approximate screen-colour distances.
- The status line reads "30 reference matches" while only the closest six cards show until "Compare all 30 colours" is chosen (unchanged behaviour, now asserted).
- A few unused `.eyebrow` CSS rules remain. Nothing is committed; git needs `-c safe.directory=...` in this worktree.
