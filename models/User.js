import mongoose from "mongoose";

const CartItemSchema = new mongoose.Schema(
    {
        productId: { type: String, required: true },
        quantity: { type: Number, default: 1 },
        variantId: { type: String, default: null },
        selectedVariants: {
            type: Map,
            of: String, // Maps variant type name to selected option name
            default: new Map()
        },
        chosenDeliveryType: { type: String, required: true },
        price: { type: Number, required: true, default: 0, min: 0 },
        orderNote: { type: String, default: "", maxlength: 500 },
        // For custom print requests
        requestId: { type: String, default: null },
    },
    { timestamps: true }
);

const OrderSchema = new mongoose.Schema(
    {
        cartItem: { type: CartItemSchema, default: {} },
        status: {
            type: String,
            enum: [
                "pending", "shipped", "delivered", "cancelled",
                "processing", "confirmed", "on_hold", "refunded", "partially_refunded"
            ],
            default: "pending",
        },
        orderType: {
            type: String,
            enum: ["order", "printOrder"],
            default: "order",
        },
        printStatus: {
            type: String,
            enum: [
                "pending_config", "configured", "printing", "printed",
                "shipped", "delivered", "cancelled", "failed", "on_hold"
            ],
            required: function () { return this.orderType === "printOrder"; }
        },
        statusUpdatedBy: { type: String, default: "system" },
        trackingId: { type: String, default: null }, // Tracking ID for shipments
        statusHistory: [{
            status: { type: String, required: true },
            timestamp: { type: Date, default: Date.now },
            updatedBy: { type: String, default: "system" }
        }], // History of status changes for timeline
        stripeSessionId: { type: String, default: null }, // Stripe checkout session ID
        notes: { type: String, default: "", maxlength: 1000 },
        schemaVersion: { type: Number, default: 2 },
    },
    { timestamps: true }
);

const ContactSchema = new mongoose.Schema({
    phone: {
        countryCode: { type: String, required: true },
        number: { type: String, required: true },
    },
    address: {
        street: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String, required: true },
        postalCode: { type: String, required: true },
        country: { type: String, required: true },
        unitNumber: { type: String, required: true },
    },
});

// Creator shop customisation (public /creators/[id] page). Everything is
// optional; images are S3 keys under shops/<userId>/ (enforced by the
// /api/user/shop routes), never full URLs.
const ShopLinkSchema = new mongoose.Schema(
    {
        label: { type: String, required: true, maxlength: 40 },
        url: { type: String, required: true, maxlength: 300 },
    },
    { _id: false }
);

const ShopBlockSchema = new mongoose.Schema(
    {
        id: { type: String, required: true, match: /^[a-z0-9]{8,16}$/ },
        type: {
            type: String,
            required: true,
            enum: ["hero", "text", "gallery", "products", "printService", "links", "contact"],
        },
        settings: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    { _id: false }
);

const ShopSchema = new mongoose.Schema(
    {
        bannerImage: { type: String, default: "", maxlength: 300 },
        logoImage: { type: String, default: "", maxlength: 300 },
        description: { type: String, default: "", maxlength: 600 },
        links: {
            type: [ShopLinkSchema],
            default: [],
            validate: [(arr) => arr.length <= 6, "At most 6 shop links"],
        },
        featuredProductIds: {
            type: [String],
            default: [],
            validate: [(arr) => arr.length <= 8, "At most 8 featured products"],
        },
        accentColor: {
            type: String,
            default: "",
            validate: {
                validator: (v) => v === "" || /^#[0-9a-fA-F]{6}$/.test(v),
                message: "accentColor must be a #rrggbb hex value",
            },
        },
        // Page builder (lib/creatorPage/blocks.js is the settings authority;
        // the API validates before anything reaches here).
        theme: {
            mode: { type: String, enum: ["light", "dark"], default: "light" },
            font: { type: String, enum: ["sans", "serif", "mono"], default: "sans" },
        },
        blocks: {
            type: [ShopBlockSchema],
            default: [],
            validate: [(arr) => arr.length <= 12, "At most 12 page blocks"],
        },
        // false = the public page shows "coming soon" to everyone but the owner.
        published: { type: Boolean, default: true },
    },
    { _id: false }
);

const UserSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    orderHistory: { type: [OrderSchema], default: [] },
    cart: { type: [CartItemSchema], default: [] },
    contact: { type: ContactSchema, required: false, default: undefined },
    usedPromoCodes: { type: [String], default: [] },
    metadata: {
        role: { type: String, default: "Customer", required: true },
            displayName: { type: String, required: false },
            autoReplyMessage: { type: String },
    },
    shop: { type: ShopSchema, required: false, default: undefined },
    creatorBannerUrl: { type: String, default: undefined },
    creatorProducts: { type: [String], default: [] },
    schemaVersion: { type: Number, default: 1 },
});

export default mongoose.models.User || mongoose.model("User", UserSchema);
