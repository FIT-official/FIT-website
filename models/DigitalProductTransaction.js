import mongoose from "mongoose";

const DigitalProductTransactionSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    transactionDate: { type: Date, default: Date.now },
    status: { type: String, enum: ["completed", "failed"], default: "completed" },
    sessionId: { type: String, required: true },
    assets: { type: [String], required: true }
});

export default mongoose.models.DigitalProductTransaction || mongoose.model("DigitalProductTransaction", DigitalProductTransactionSchema);
