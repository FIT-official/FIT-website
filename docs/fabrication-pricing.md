# Fabrication pricing

Fabrication services use selling rates entered by the provider in SGD. The catalogue can describe laser cutting, engraving, name tags, dot-peen marking, SLS, metal printing and other custom making services. Providers can name their own custom service, choose its pricing basis and offer selectable customizations. Every estimate requires provider confirmation. It is neither a production approval nor a calculated manufacturing cost.

The shared domain is independent of authentication and payment. Server routes must enforce Pro access, provider ownership, asset permissions, request quotas and payment/status rules before using a result.

## Catalogue and input

`lib/fabrication/catalog.js` exports:

- `FABRICATION_KINDS`: `{id, label, isVolume}[]` for six named processes and `custom`. The `isVolume` kind flag describes fixed kinds; use `pricingBasisForOffer` for a custom offer.
- `FABRICATION_KIND_IDS`, `FABRICATION_FONTS` and `FABRICATION_LIMITS`.
- `FABRICATION_PRICING_BASES`: metadata for `area`, `volume`, `length`, `item` and `manual`.
- `pricingBasisForOffer(offer)`: `{id,label,unit,requiresWidth,requiresHeight,requiresDepth,isVolume,isManual}`. Existing kinds derive their fixed basis; custom offers use their `pricingBasis`, defaulting to `manual`.
- `emptyFabricationCatalog()`: a new `{enabled:false, offers:[]}` object.
- `createFabricationOffer(kind)`: a disabled example with unique offer/material IDs and one editable material row.
- `starterFabricationCatalog()`: seven disabled examples. The custom example starts with no automatic price.
- `publicFabricationCatalog(doc)`: an allowlisted published catalogue, or `null`. Disabled offers, owner fields, internal costs and signed image URLs are omitted. Pass the catalogue itself, rather than a containing database document.

The owner catalogue is:

```js
{
  enabled: false,
  offers: [{
    id: 'name-tags',
    kind: 'name_tag',
    name: 'Personalised name tags',
    description: 'Personalised tags for bags, desks and equipment.',
    enabled: false,
    leadTimeDays: 7,
    materials: [{
      id: 'acrylic-3mm',
      name: 'Acrylic (3 mm)',
      thicknessMm: 3,
      pricePerCm2: 0.02,
      pricePerCm3: 0,
      pricePerCm: 0,
      setupFee: 5,
      perItemFee: 1,
      minimumCharge: 10,
      maxWidthMm: 200,
      maxHeightMm: 200,
      maxDepthMm: 3
    }],
    optionGroups: [{
      id: 'finish', name: 'Finish', required: true,
      choices: [
        { id: 'plain', label: 'Plain', priceDelta: 0 },
        { id: 'polished', label: 'Polished', priceDelta: 1.25 }
      ]
    }]
    // Optional template:
    // template: {
    //   assetId: 'provider-owned-asset-id',
    //   region: { x: 0.1, y: 0.2, width: 0.8, height: 0.6 },
    //   textColor: '#000000', fontFamily: 'sans'
    // }
  }]
}
```

These numbers are illustrative formula examples, not market prices or evidence of a profitable service. New example offers stay disabled. Providers must replace their material, rates, limits and lead time before publishing. No real template image is created by the helper; the provider supplies an authorized asset.

`lib/fabrication/validate.js` exports `validateFabricationCatalog(input)`, `validateFabricationInput(input)` and `validateFabricationPersonalization(input)`. They return `{ok:true,value}` or `{ok:false,error,issues}`; all nested objects reject unknown fields. Prices, discounts, asset URLs and arbitrary CSS are not valid customer input.

```js
{
  offerId: 'name-tags',
  materialId: 'acrylic-3mm',
  widthMm: 100,
  heightMm: 50,
  quantity: 3,
  // depthMm: 30, // required for any volume-priced offer
  selectedOptions: { finish: 'polished' },
  personalization: {
    text: 'Alex Tan',
    region: { x: 0.2, y: 0.3, width: 0.6, height: 0.3 },
    fontFamily: 'sans',
    textColor: '#000000'
  },
  customerNote: 'Rounded corners, please.'
}
```

Thickness is selected through an exact material row. Area-process requests must omit `depthMm`; their saved depth comes from that row's `thicknessMm`. Named sheet/marking processes require positive thickness. A custom area service may use zero thickness when thickness does not describe its service. Volume-process rows use `thicknessMm:0`, and the customer supplies depth. An unknown row is rejected; there is no thickness interpolation.

The shared catalogue validator accepts up to 24 offers in one batch/page, with 40 material rows per offer. This is a payload bound, not a total service entitlement. Separate paged service storage can hold any number of offers. Draft-only pages can be validated with `enabled:false`; a published estimate is calculated against the selected enabled offer. There are up to 12 option groups per offer and 30 choices per group. Additional service offers can describe further variations without increasing a single request's size.

Other bounds are quantity 1–1,000, supplied dimensions 0.01–5,000 mm and lead time 1–120 days. Provider material limits can be smaller. Each selling rate/fee, selected per-item option sum and computed order total are capped at SGD 100,000. Rates allow six decimal places; fixed fees and option additions use whole cents. Non-finite values, duplicate IDs and wrong-unit rates are rejected. Enabled automatically priced rows need a base price or a positive minimum addition across required option groups. Optional paid choices and a required group with a free choice do not establish that minimum. Manual offers can have no price. Automatic amounts below one cent still require provider pricing rather than being shown as free.

`selectedOptions` maps published group IDs to one published choice ID per group. Required groups must be selected; optional groups may be omitted. Unknown groups, choices from another group, arrays, customer-supplied labels and rates are rejected. Option `priceDelta` is a nonnegative addition per item, not a discount or a fee per order. The calculator copies the chosen labels and prices into the estimate snapshot.

Personalization supports up to 120 characters, including line breaks. Font IDs are exactly `sans`, `serif` and `mono`; colour is six-digit hex. Regions use normalized image coordinates, with positive width/height fully inside [0,1]. Templates are omitted when absent; `null` is not a template.

The calculator validates region shape without making an asset-ownership decision. Backend routes must resolve an owned customer image or authorized provider template. For an unchanged provider template image, enforce containment using `isFabricationRegionContained(customerRegion, templateRegion)`. An owned replacement image and a provider-adjusted proof may use another valid region. The original customer personalization must remain available separately from provider edits.

## Calculation

For laser cutting, engraving, name tags, dot-peen marking and custom area pricing:

```text
area per item (cm²) = widthMm × heightMm / 100
process charge per item = area × pricePerCm2
```

For SLS, metal printing and custom volume pricing:

```text
envelope per item (cm³) = widthMm × heightMm × depthMm / 1,000
process charge per item = envelope × pricePerCm3
```

For custom length pricing:

```text
length per item (cm) = widthMm / 10
process charge per item = length × pricePerCm
```

Length uses `widthMm` as its input field and displays centimetres as the pricing unit. It is an entered length, not a computed cutting path or perimeter. Custom item pricing has no measured process charge; it uses `perItemFee` and selected options. Custom manual pricing returns `total:null` and `manualReviewRequired:true`, even if an option or fee schedule is shown. These known additions do not establish a complete quote. Interfaces must show a provider-quote message, never format `null` as SGD 0.

The volume is a rectangular bounding envelope supplied by the customer. It is not measured model material volume, powder consumption, support volume or build time. The area is the full entered rectangle; moving text or changing an image region does not change it. No cutting path, raster coverage, nesting, toolpath, fit or manufacturing feasibility is computed here.

Width and height are required only for area and volume pricing; depth is required for volume; length needs width only. Item and manual pricing need no dimensions. Additional supplied dimensions remain bounded by the published material limits but do not change a length/item/manual quote. All customer requests still choose a published material/service row. A manual service can label its default row "Standard service".

All automatic pricing bases then use:

```text
options per item = sum of selected published priceDelta values
subtotal = quantity × (process charge per item + perItemFee + options per item) + setupFee
estimate = max(subtotal, minimumCharge)
```

Setup and minimum are applied once per order. Fractional unit charges accumulate before the total is rounded to cents. An order which would round below SGD 0.01 needs provider pricing.

With the illustrative area row above and the zero-cost Plain finish, a 100 × 50 mm item occupies 50 cm². Three items cost `3 × (50 × 0.02 + 1) + 5 = SGD 11.00`. Selecting the SGD 1.25 Polished finish adds SGD 3.75 for three items. Two 20 × 10 mm items with Plain finish produce SGD 7.08 before the order minimum, so the estimate is SGD 10.00.

With an illustrative volume rate of SGD 0.50/cm³, a 10 × 20 × 30 mm envelope is 6 cm³. At the same item/setup fees, two items produce `2 × (6 × 0.50 + 1) + 5 = SGD 13.00`. This remains an envelope-based indication for provider review.

For a custom item service with SGD 2 per item, SGD 5 setup and selected additions of SGD 1.25 and SGD 2.50 per item, three items produce `3 × (2 + 1.25 + 2.50) + 5 = SGD 22.25`. Changing an option recalculates the estimate from provider rates. The original saved selection must not be rewritten when a provider later edits those rates.

## Estimate snapshot

`calculateFabricationEstimate(catalog, input)` returns `{ok:true,value}` or `{ok:false,status:400,error,issues}`. Its value contains:

```js
{
  currency: 'sgd',
  offer: { id, kind, name, pricingBasis },
  material: { id, name, thicknessMm },
  dimensions: { widthMm, heightMm, depthMm }, // only supplied/applicable dimensions
  quantity,
  selectedOptions: { finish: 'polished' },
  personalization, // omitted when not provided
  customerNote,
  estimate: {
    basis: 'area', // bounding_envelope, length, item or manual
    measurePerItem,
    unit: 'cm2', // cm3, cm, item or null for manual
    rate,
    processPerItem,
    perItemFee,
    options: [{ groupId, groupName, choiceId, label, priceDelta }],
    optionsPerItem,
    setupFee,
    subtotal,
    minimumCharge,
    minimumApplied,
    total,
    providerConfirmationRequired: true,
    manualReviewRequired: false
  }
}
```

For manual pricing, `measurePerItem`, `unit`, `rate`, `processPerItem`, `subtotal` and `total` are `null`, `minimumApplied` is false, and `manualReviewRequired` is true. Published fee and option fields remain visible as reference terms. The provider must confirm the complete price.

The result is normalized and independent of the input objects. Snapshot it with the request so later catalogue changes do not rewrite the original estimate. Asset IDs, creator IDs and idempotency keys belong to the backend request envelope and must be validated there before passing the strict calculation input.

## Setting workable selling rates

An area or envelope rate is a simplified selling rule. Calibrate it with representative jobs and compare the estimate with actual material use, machine time, operator time, finishing, failures and packaging. Treat each material/thickness/process combination separately.

Official manufacturing guidance supports these cost drivers:

- Laser cutting depends on material, size, geometric complexity and finishing; intricate paths and large engraved areas take longer. [Ponoko laser cutting](https://www.ponoko.com/laser-cutting)
- Engraving depends on marked area, vector versus raster design and machine time. An area-only rule cannot resolve every design's processing time. [Ponoko engraving](https://www.ponoko.com/laser-engraving)
- SLS material use depends on sintered material, non-reusable powder, refresh rate and packing density. Labor, equipment and electricity also contribute to cost. Envelope pricing does not reproduce this model. [Formlabs cost per part](https://formlabs.com/white-papers/calculating-sls-cost-per-part/)
- Metal printing depends on size, geometry, material, orientation, quantity and post-processing. Supports can need removal by sawing, grinding or machining. [Protolabs DMLS](https://www.protolabs.com/en-gb/services/3d-printing/direct-metal-laser-sintering/), [Protolabs metal design guidance](https://www.protolabs.com/resources/design-tips/how-to-design-and-manufacture-metal-3d-printed-parts/)
- Dot-peen marking requires material- and surface-specific impact, dot density, spacing and travel settings. The area rule is a commercial estimate, not a prediction of marking cycle time or compatibility. [SIC Marking process guidance](https://www.sic-marking.com/specific-uses/dot-peen-marking/)

For planning, define an order cost `C` from material consumed, machine time, direct labor, finishing, packaging, expected rework and an appropriate overhead allocation. Avoid counting the same machine/overhead cost twice. If a selling channel charges a fraction `r` of price plus fixed fee `f`, a target margin `m` on that stated cost basis requires:

```text
target selling price = (C + f) / (1 - r - m)
```

The denominator must be positive. This is algebra for the provider's own verified inputs, not a promised margin or a cost calculated by FIT. Taxes, delivery, design work and special finishing must be handled consistently with what the published rate includes. The current domain calculates the specified fabrication estimate only.

Sources checked 23 September 2026. No competitor price has been adopted as a universal FIT selling rate.

## Verification

87 focused tests cover the named processes and all five custom pricing bases, required dimensions, per-item choices, required and unpublished selections, manual null totals, units, quantity, order setup/minimum, fractional-unit rounding, exact thickness rows, price tampering, non-finite values, payload limits, strict fields, disabled examples, public allowlisting, region bounds, font IDs and snapshot independence. These are shared-domain tests; they do not establish service availability, production costs, asset authorization or live order readiness.
