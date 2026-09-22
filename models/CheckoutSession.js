import mongoose from "mongoose";

const CheckoutSessionSchema = new mongoose.Schema(
    {
        sessionId: { type: String, required: true, unique: true },
        userId: { type: String, required: true },
        snapshotVersion: { type: Number, immutable: true },
        // Server-priced purchase contract. Legacy rows intentionally have no
        // snapshot and must be reconciled, never rebuilt from a current cart.
        items: { type: [mongoose.Schema.Types.Mixed], default: undefined, immutable: true },
        shippingAddress: { type: mongoose.Schema.Types.Mixed, immutable: true },
        customerEmail: { type: String, immutable: true },
        customerName: { type: String, immutable: true },
        salesData: {
            type: Map,
            of: {
                totalAmount: Number,
                productRevenue: Number,
                shippingRevenue: Number,
                items: [{
                    productId: String,
                    variantId: String,
                    quantity: Number,
                    unitPrice: Number,
                    deliveryFee: Number,
                    deliveryType: String
                }]
            }
        },
        digitalProductData: {
            type: Map,
            of: {
                buyer: String,
                links: [String]
            }
        },
        status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
        totalAmount: { type: Number, required: true, immutable: true },
        currency: { type: String, default: 'sgd', immutable: true },
        processed: { type: Boolean, default: false }
    },
    { timestamps: true }
);

export default mongoose.models.CheckoutSession || mongoose.model("CheckoutSession", CheckoutSessionSchema);
