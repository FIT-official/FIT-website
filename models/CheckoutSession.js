import mongoose from "mongoose";

const ReconciliationReceiptSchema = new mongoose.Schema({
    reason: { type: String, enum: ['legacy_snapshot_missing'], required: true },
    paymentStatus: { type: String, enum: ['paid'], required: true },
    amountTotalCents: { type: Number, min: 0, required: true, validate: Number.isSafeInteger },
    currency: { type: String, match: /^[a-z]{3}$/, required: true },
    paymentIntentId: { type: String, default: null },
    stripeEventId: { type: String, required: true },
    recordedAt: { type: Date, required: true },
    eventCreatedAt: { type: Date, required: true },
    expectedAmountCents: { type: Number, default: null },
    expectedCurrency: { type: String, default: null },
    amountMismatch: { type: Boolean, required: true },
    currencyMismatch: { type: Boolean, required: true },
}, { _id: false, strict: 'throw' });

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
        status: { type: String, enum: ['pending', 'completed', 'failed', 'reconciliation_required'], default: 'pending' },
        // Recorded once from a verified paid Stripe event, never from a cart.
        reconciliation: { type: ReconciliationReceiptSchema, default: undefined, immutable: true },
        totalAmount: { type: Number, required: true, immutable: true },
        currency: { type: String, default: 'sgd', immutable: true },
        processed: { type: Boolean, default: false }
    },
    { timestamps: true }
);

export default mongoose.models.CheckoutSession || mongoose.model("CheckoutSession", CheckoutSessionSchema);
