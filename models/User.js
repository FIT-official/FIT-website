import mongoose from "mongoose";

const CartItemSchema = new mongoose.Schema(
    {
        productId: { type: String, required: true },
        quantity: { type: Number, default: 1 },
        // Legacy variant system (for backward compatibility)
        variantId: { type: String, default: null },
        // New variant selection system
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
    creatorBannerUrl: { type: String, default: undefined },
    creatorProducts: { type: [String], default: [] },
    schemaVersion: { type: Number, default: 1 },
});

export default mongoose.models.User || mongoose.model("User", UserSchema);
