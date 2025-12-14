import mongoose from "mongoose";

const ChannelSummarySchema = new mongoose.Schema(
    {
        channelId: { type: String, required: true, index: true, unique: true },
        kind: { type: String, default: "support" },
        participants: [
            {
                id: String,
                name: String,
                imageUrl: String,
            },
        ],
        lastMessage: {
            id: String,
            text: String,
            createdAt: Date,
            userId: String,
        },
        // Members of this channel (user ids) for quick lookup
        memberIds: { type: [String], index: true },
    },
    { timestamps: true }
);

ChannelSummarySchema.index({ memberIds: 1 });

export default mongoose.models.ChannelSummary ||
    mongoose.model("ChannelSummary", ChannelSummarySchema);
