import mongoose from "mongoose";

const ChatReadStateSchema = new mongoose.Schema(
    {
        userId: { type: String, required: true, index: true },
        channelId: { type: String, required: true, index: true },
        lastReadAt: { type: Date, required: true, default: Date.now },
    },
    { timestamps: true }
);

ChatReadStateSchema.index({ userId: 1, channelId: 1 }, { unique: true });

export default mongoose.models.ChatReadState || mongoose.model("ChatReadState", ChatReadStateSchema);
