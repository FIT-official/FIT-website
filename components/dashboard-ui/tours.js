// Guided-tour content (blueprint §9.11) — panelKey → CoachMarks steps.
// Adding a tour is DATA, not code: write plain-language copy that answers
// "what is this and why do I care", point each step at a stable
// `data-tour="…"` attribute in the panel, and mount `<CoachMarks />` with
// the panel's key. Steps whose selector isn't on screen are skipped
// automatically (e.g. cards that only render in a certain sub-view).

export const TOURS = {
    delivery: [
        {
            selector: '[data-tour="delivery-list"]',
            title: 'What’s a delivery type?',
            body: 'Delivery types are the shipping options your customers pick at checkout: pickup, standard post, express. You set the price rules once here, and every product reuses them.',
        },
        {
            selector: '[data-tour="delivery-new"]',
            title: 'Add your own',
            body: 'Each new type can have a zero configured rate, a formula (base + volume + weight), or a price set by the creator per product. FIT Standard delivery uses the cart shipping rules.',
        },
        {
            selector: '[data-tour="delivery-toggle"]',
            title: 'Switch types on and off',
            body: 'Turning a type off removes it from checkout immediately without deleting its pricing, which is handy for pausing a courier over holidays.',
        },
    ],
    quoting: [
        {
            selector: '[data-tour="quoting-tabs"]',
            title: 'One job per tab',
            body: 'Everything the instant-quote engine charges lives here, split by job: your rates, extra fees and rush pricing, how fast your machines print, their size limits, and the colours you offer.',
        },
        {
            selector: '[data-tour="quoting-card"]',
            title: 'Rates drive every quote',
            body: 'A quote is basically material used × your per-gram rate, plus machine time × your hourly rate. Get these two numbers right and every automatic quote is right.',
        },
        {
            selector: '[data-tour="quoting-save"]',
            title: 'Save applies everywhere',
            body: 'Saving updates the whole store at once. Every new quote is recalculated on the server from these numbers, so customers can never pay stale prices.',
        },
    ],
    customPrintRequests: [
        {
            selector: '[data-tour="requests-list"]',
            title: 'Your print job queue',
            body: 'Every custom print request a customer sends lands here as a job card: the model they uploaded, who asked, and where it is in its life (quote → pay → print → ship).',
        },
        {
            selector: '[data-tour="requests-views"]',
            title: 'Saved views',
            body: 'These tabs are the queue’s lifecycle. “Needs quote” is your to-do list: jobs waiting on a price from you. The counts update as you work.',
        },
        {
            selector: '[data-tour="requests-search"]',
            title: 'Find any job fast',
            body: 'Search by model name, customer email or request ID. Handy when a customer emails you about “that dragon file”.',
        },
        {
            selector: '[data-tour="requests-export"]',
            title: 'Take the queue with you',
            body: 'Export downloads exactly what you’re looking at, the current search and tab, as a spreadsheet for planning or bookkeeping.',
        },
    ],
    content: [
        {
            selector: '[data-tour="cms-sections"]',
            title: 'Pick what to edit',
            body: 'Each card is one editable piece of your storefront: the homepage hero, the about page, legal pages. Pick one and its fields appear below.',
        },
        {
            selector: '[data-tour="cms-editor"]',
            title: 'Edit like a form',
            body: 'Text, images and lists are plain fields, no code. What you type here is exactly what visitors read on the live site.',
        },
        {
            selector: '[data-tour="cms-preview"]',
            title: 'See it before they do',
            body: 'The preview shows the real page with your last saved content. Save, then refresh the preview to check your change before customers see it.',
        },
        {
            selector: '[data-tour="cms-savebar"]',
            title: 'Save lives up here',
            body: 'Save publishes the section you’re editing; Reset throws away unsaved edits and reloads what’s live. Nothing changes on the site until you save.',
        },
    ],
    printTiming: [
        {
            selector: '[data-tour="timing-steps"]',
            title: 'Why calibrate?',
            body: 'Quotes charge for machine time, so the engine needs to know how fast YOUR printers really are. Three steps (add a model, print and time it, apply) and estimates match reality.',
        },
        {
            selector: '[data-tour="timing-add"]',
            title: 'Add a test print',
            body: 'Upload any model you’re happy to test-print, with the settings you’d actually use. The file is measured for an estimate and then discarded; nothing is stored.',
        },
        {
            selector: '[data-tour="timing-samples"]',
            title: 'Enter the real times',
            body: 'After each test print, type in how long the printer said it took. Two differently-shaped prints (one flat and wide, one tall and narrow) are enough to calibrate.',
        },
        {
            selector: '[data-tour="timing-apply"]',
            title: 'Apply with one click',
            body: 'Once enough timed prints exist, this shows how far estimates are off today and how close they’ll be after calibration. One click tunes every future quote.',
        },
    ],
}
