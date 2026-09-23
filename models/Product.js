import mongoose from "mongoose";

const DeliveryTypeSchema = new mongoose.Schema(
    {
        type: { type: String, required: true }, // "digital" or reference to deliveryType name from AppSettings
        price: {
            type: Number,
            required: false,
            default: 0,
        },
        customPrice: { type: Number, default: null, required: false }, // Creator's override price
        customDescription: { type: String, default: null, required: false }, // Creator's custom notes (e.g., pickup location)
        pickupLocation: { type: String, default: null, required: false }, // Legacy - keep for backward compatibility
        deliveryTypeConfigId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'AppSettings.additionalDeliveryTypes',
            required: false
        },
    },
    { _id: false }
);

const ReviewSchema = new mongoose.Schema(
    {
        userId: { type: String, required: true, },
        username: { type: String, required: true }, // Reviewer's username for display
        userImageUrl: { type: String, required: false }, // Reviewer's profile image
        rating: { type: Number, required: true, min: 1, max: 5 },
        comment: { type: String, required: false },
        mediaUrls: { type: [String], default: [], required: false, validate: [arr => arr.length <= 3, 'Max 3 media'] },
        // Store which specific product variant was purchased (if any)
        purchasedVariants: {
            type: Map,
            of: String, // Maps variant type name to selected option name
            default: new Map()
        },
        verifiedPurchase: { type: Boolean, default: false }, // Mark if this review is from a verified buyer
        helpful: { type: [String], default: [] }, // Array of userIds who marked this review as helpful
    },
    { timestamps: true }
)

const SaleSchema = new mongoose.Schema(
    {
        userId: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true, min: 0 },
    }, { timestamps: true })

const DiscountTierSchema = new mongoose.Schema({
    minQty: { type: Number, required: true, min: 1 },
    maxQty: { type: Number, required: false, min: 1 }, // optional upper bound
    percentage: { type: Number, required: true, min: 1, max: 100 },
}, { _id: false });

const DiscountSchema = new mongoose.Schema({
    eventId: { type: String, required: false, default: null },
    percentage: {
        type: Number,
        required: false,
    },
    minimumAmount: {
        type: Number,
        required: false,
        default: 0,
    },
    startDate: {
        type: Date,
        required: false,
    },
    endDate: {
        type: Date,
        required: false,
    },
    tiers: {
        type: [DiscountTierSchema],
        required: false,
        default: [],
    },
}, { _id: false, timestamps: true });

const VariantOptionSchema = new mongoose.Schema({
    name: { type: String, required: true },
    additionalFee: { type: Number, required: true, default: 0 },
    stock: { type: Number, required: false, min: 0 },
    image: { type: String, required: false, default: null },
    // Colour swatch for colour-type variants. For print products this is the
    // admin filament-stock hex; for shop products it's a free-form colour. Used
    // by the print-delivery flow to colour the model. See openspec change
    // `migrate-print-delivery-to-custom-requests`.
    hex: { type: String, required: false, default: null },
}, { _id: true });

const VariantTypeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    options: { type: [VariantOptionSchema], required: true, validate: [arr => arr.length > 0, 'At least one option is required'] },
}, { _id: true });


const ProductSchema = new mongoose.Schema(
    {
        creatorUserId: { type: String, required: true },
        name: { type: String, required: true },
        description: { type: String, required: true },
        images: { type: [String], default: [], validate: [arr => arr.length <= 7, 'Max 7 images'] },
        viewableModel: { type: String, required: false, default: null },
        paidAssets: { type: [String], default: [], required: false },
        basePrice: {
            presentmentCurrency: { type: String, required: true, default: 'SGD' },
            presentmentAmount: { type: Number, required: true, min: 0 },
        },
        priceCredits: { type: Number, required: true },
        stock: { type: Number, required: false, min: 0 },
        infiniteStock: { type: Boolean, default: false },
        productType: { type: String, enum: ["print", "shop"], required: true, default: "shop" },

        // Print-delivery products (productType: "print"): the vendor's FIXED
        // advanced print config (→ a fixed quote). The customer cannot change
        // these settings; colour is chosen via a colour-type variant (whose
        // options carry `hex`). See openspec change
        // `migrate-print-delivery-to-custom-requests`.
        printConfig: {
            layerHeight: { type: Number, default: 0.2 },
            materialType: { type: String, enum: ['plastic', 'resin', 'metal', 'sandstone'], default: 'plastic' },
            wallLoops: { type: Number, default: 2 },
            sparseInfillDensity: { type: Number, default: 20 },
            nozzleDiameter: { type: Number, default: 0.4 },
            enableSupport: { type: Boolean, default: false },
        },

        // Legacy category system (for backward compatibility)
        category: { type: Number, required: false, default: 0 },
        subcategory: { type: Number, required: false, default: 0 },
        // New name-based category system (references SHOP_CATEGORIES/PRINT_CATEGORIES from lib/categories.js)
        categoryId: {
            type: String,
            required: false
        },
        subcategoryId: {
            type: String,
            required: false
        },

        variantTypes: {
            type: [VariantTypeSchema],
            required: false,
            default: [],
            validate: [arr => arr.length <= 5, 'Maximum 5 variant types allowed']
        },
        delivery: {
            deliveryTypes: [DeliveryTypeSchema],
        },
        dimensions: {
            length: Number,
            width: Number,
            height: Number,
            weight: Number,
        },
        downloads: { type: Number, default: 0 },
        prints: { type: Number, default: 0 },
        sales: { type: [SaleSchema], default: [] },
        reviews: { type: [ReviewSchema], default: [] },
        discount: { type: DiscountSchema, default: {} },
        // New stacked discounts array for advanced use-cases.
        // Legacy code continues to rely on the single `discount` field.
        discounts: { type: [DiscountSchema], default: [] },
        likes: { type: [String], default: [] },
        hidden: { type: Boolean, default: false },
        flaggedForModeration: { type: Boolean, default: false },
        // Which storefront lists the product: 'fit' = Fix It Today's own
        // catalogue (/shop, /prints, homepage), 'creator' = only on the
        // creator's page. Set server-side from the poster's role; never
        // changed on edit. Backfill: scripts/migrate-product-listing.js.
        listing: { type: String, enum: ["fit", "creator"], default: "creator", index: true },
        slug: { type: String, required: true, unique: true, index: true },
        schemaVersion: { type: Number, default: 3 },
    },
    { _id: true, timestamps: true }
);

export default mongoose.models.Product || mongoose.model("Product", ProductSchema);
