// Public, owner-confirmed information only. Never put credentials in this file.
// Sources: current footer, PrintRequestFlow, cart, checkout/session and bulk form.
export const siteFacts = Object.freeze({
    email: 'fixittoday.contact@gmail.com',
    linkedIn: 'https://www.linkedin.com/company/fix-it-today-sg',
    printFileTypes: ['3MF', 'STL', 'OBJ'],
    deliveryOptions: ['Express courier', 'Standard delivery', 'Self pick-up'],
    selfCollection: 'Self-collection in Singapore',
    bulkQuotePath: '/shop/bulk-filament',
    cardPayments: true,
    heroVideo: null, // pending owner confirmation; self-hosted video URL
    whatsappNumber: null, // pending owner confirmation; international digits
    address: null, // pending owner confirmation; { streetAddress, addressLocality, postalCode, addressCountry }
    openingHours: null, // pending owner confirmation; array of Schema.org openingHours strings
    pickupDetails: null, // pending owner confirmation
    googleBusinessProfileUrl: null, // pending owner confirmation
    googleRating: null, // pending owner confirmation; { value, count }
    reviews: null, // pending owner confirmation; [{ quote, author }] with publication consent
    clientLogos: null, // pending owner confirmation; [{ src, name }] with logo permission
    workshopDates: null, // pending owner confirmation
    turnaround: null, // pending owner confirmation
    instagramHandle: null, // pending owner confirmation
    repairPhotos: null, // pending owner confirmation; photos and customer consent
    projectGallery: null, // pending owner confirmation; photos and publication consent
    livePrintJobs: null, // pending owner confirmation; photos and privacy review
    creatorSpotlight: null, // pending owner confirmation; creator consent
    purchaseOrders: null, // pending owner confirmation
    gstInvoices: null, // pending owner confirmation
})
