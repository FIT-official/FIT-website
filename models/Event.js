import mongoose from "mongoose";

const EventSchema = new mongoose.Schema({
    creatorUserId: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    locations: { type: [String], required: false, default: [] },
    isActive: { type: Boolean, default: true },
    // When true, this event's discount should apply store-wide
    isGlobal: { type: Boolean, default: false },
    percentage: {
        type: Number,
        required: function () {
            return !this.eventId;
        },
    },
    minimumPrice: {
        type: Number,
        required: function () {
            return !this.eventId;
        },
        default: 0,
    },
    startDate: {
        type: Date,
        required: function () {
            return !this.eventId;
        },
    },
    endDate: {
        type: Date,
        required: function () {
            return !this.eventId;
        },
    },
    schemaVersion: { type: Number, default: 1 },
}, { _id: true, timestamps: true, unique: true });

export default mongoose.models.Event || mongoose.model("Event", EventSchema);