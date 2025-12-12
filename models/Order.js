import mongoose from "mongoose";

const OrderItemSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    productSlug: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    // Variant information
    selectedVariants: {
        type: Map,
        of: String, // Maps variant type name to selected option name
        default: new Map()
    },
    variantInfo: [{
        type: { type: String, required: true },
        option: { type: String, required: true },
        additionalFee: { type: Number, default: 0 }
    }],
    // Pricing breakdown
    basePrice: { type: Number, required: true },
    variantFees: { type: Number, default: 0 },
    priceBeforeDiscount: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    finalPrice: { type: Number, required: true }, // Price after discount, before delivery
    deliveryFee: { type: Number, default: 0 },
    totalPrice: { type: Number, required: true }, // Final + delivery
    currency: { type: String, default: 'SGD' },
    // Delivery information
    chosenDeliveryType: { type: String, required: true },
    orderNote: { type: String, default: "" },
    // For custom print requests
    requestId: { type: String, default: null },
    // Review tracking
    reviewed: { type: Boolean, default: false },
    reviewId: { type: mongoose.Schema.Types.ObjectId, default: null }
}, { _id: true });

const OrderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    stripeSessionId: { type: String, required: true, unique: true },
    stripePaymentIntentId: { type: String, default: null },

    // Payment information
    paymentMethod: {
        type: { type: String, default: null }, // 'card', 'bank_transfer', etc.
        brand: { type: String, default: null }, // 'visa', 'mastercard', etc.
        last4: { type: String, default: null }, // Last 4 digits of card
        expiryMonth: { type: Number, default: null },
        expiryYear: { type: Number, default: null }
    },

    // Customer information
    customerEmail: { type: String, required: true },
    customerName: { type: String, required: false },
    shippingAddress: {
        line1: { type: String, default: null },
        line2: { type: String, default: null },
        city: { type: String, default: null },
        state: { type: String, default: null },
        postalCode: { type: String, default: null },
        country: { type: String, default: null }
    },

    // Order items
    items: [OrderItemSchema],

    // Order totals
    subtotal: { type: Number, required: true },
    totalDiscount: { type: Number, default: 0 },
    totalDelivery: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    currency: { type: String, default: 'SGD' },

    // Order status
    status: {
        type: String,
        enum: [
            "pending", "processing", "confirmed", "shipped", "delivered",
            "cancelled", "on_hold", "refunded", "partially_refunded"
        ],
        default: "pending",
    },
    statusHistory: [{
        status: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        updatedBy: { type: String, default: "system" },
        note: { type: String, default: "" }
    }],

    // Tracking
    trackingNumber: { type: String, default: null },
    trackingUrl: { type: String, default: null },

    // Notes
    customerNote: { type: String, default: "" },
    adminNote: { type: String, default: "" },

}, { timestamps: true });

// Index for faster queries
OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ stripeSessionId: 1 });
OrderSchema.index({ orderId: 1 });

export default mongoose.models.Order || mongoose.model("Order", OrderSchema);
