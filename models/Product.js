import mongoose from "mongoose";

const DeliveryTypeSchema = new mongoose.Schema(
    {
        type: { type: String, required: true },
        price: {
            type: Number,
            required: false,
            default: 0,
        },
        pickupLocation: { type: String, default: null, required: false },
        royaltyFee: { type: Number, default: 0, required: false },
    },
    { _id: false }
);

const ReviewSchema = new mongoose.Schema(
    {
        userId: { type: String, required: true, },
        rating: { type: Number, required: true, min: 1, max: 5 },
        comment: { type: String, required: false },
        mediaUrls: { type: [String], default: [], required: false, validate: [arr => arr.length <= 3, 'Max 3 media'] },
    },
    { timestamps: true }
)

const SaleSchema = new mongoose.Schema(
    {
        userId: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true, min: 0 },
    }, { timestamps: true })

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
}, { _id: false, timestamps: true });

const ProductSchema = new mongoose.Schema(
    {
        creatorUserId: { type: String, required: true },
        name: { type: String, required: true },
        description: { type: String, required: true },
        images: { type: [String], default: [], validate: [arr => arr.length <= 7, 'Max 7 images'] },
        viewableModel: { type: String, required: false, default: null }, // v1.1 feature
        paidAssets: { type: [String], default: [], required: false }, // v1.1 feature
        price: {
            presentmentCurrency: { type: String, required: true },
            presentmentAmount: { type: Number, required: true, min: 0 },
        },
        priceCredits: { type: Number, required: true },
        stock: { type: Number, required: false, min: 0 },
        productType: { type: String, enum: ["print", "shop"], required: true, default: "shop" },
        category: { type: Number, required: true, default: 0 },
        subcategory: { type: Number, required: true, default: 0 },
        variants: { type: [String], default: [] },
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
        likes: { type: [String], default: [] },
        hidden: { type: Boolean, default: false },
        flaggedForModeration: { type: Boolean, default: false },
        slug: { type: String, required: true, unique: true, index: true },
        schemaVersion: { type: Number, default: 1 },
    },
    { _id: true, timestamps: true }
);

export default mongoose.models.Product || mongoose.model("Product", ProductSchema);
