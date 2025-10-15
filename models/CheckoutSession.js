import mongoose from "mongoose";

const CheckoutSessionSchema = new mongoose.Schema(
    {
        sessionId: { type: String, required: true, unique: true },
        userId: { type: String, required: true },
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
        totalAmount: { type: Number, required: true },
        currency: { type: String, default: 'sgd' },
        processed: { type: Boolean, default: false }
    },
    { timestamps: true }
);

export default mongoose.models.CheckoutSession || mongoose.model("CheckoutSession", CheckoutSessionSchema);