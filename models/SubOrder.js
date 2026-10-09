import mongoose from 'mongoose';
const schema = new mongoose.Schema({
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    storeId: { type: String, required: true },
    items: [{ productId: String, name: String, qty: Number, price: Number, unitAmountCents: Number, productType: String, printJobId: String }],
    status: { type: String, enum: ['paid', 'in_production', 'qc', 'ready', 'shipped', 'delivered', 'cancelled', 'refunded'], required: true },
    statusHistory: [{ status: String, at: { type: Date, default: Date.now }, by: String }],
    fulfilment: { type: String, enum: ['fit', 'creator'], default: 'fit' },
    tracking: String,
}, { timestamps: true, autoCreate: false, autoIndex: false });
schema.index({ orderId: 1, storeId: 1 }, { unique: true });
schema.index({ storeId: 1, createdAt: -1 });
export default mongoose.models.SubOrder || mongoose.model('SubOrder', schema);
