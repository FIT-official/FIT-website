import mongoose from "mongoose";

const AdditionalDeliveryTypeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    displayName: { type: String, required: true },
    description: { type: String, default: "" },
    feeName: { type: String, default: "" },
    applicableToProductTypes: [{ type: String, enum: ["shop", "print"] }],
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
}, { _id: true });

const AdditionalOrderStatusSchema = new mongoose.Schema({
    statusKey: { type: String, required: true },
    displayName: { type: String, required: true },
    description: { type: String, default: "" },
    orderType: { type: String, enum: ["order", "printOrder"], required: true },
    color: { type: String, default: "#6b7280" },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
}, { _id: true });

const AdditionalCategorySchema = new mongoose.Schema({
    name: { type: String, required: true },
    displayName: { type: String, required: true },
    type: { type: String, enum: ["shop", "print"], required: true },
    description: { type: String, default: "" },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
}, { _id: true });

const AppSettingsSchema = new mongoose.Schema({
    // There should only be one settings document
    _id: { type: String, default: "app-settings" },

    // Additional delivery types (beyond the hardcoded digital, selfCollect, singpost, privateDelivery)
    additionalDeliveryTypes: [AdditionalDeliveryTypeSchema],

    // Additional order statuses (beyond the hardcoded enum ones)
    additionalOrderStatuses: [AdditionalOrderStatusSchema],

    // Additional categories (beyond the hardcoded legacy ones)
    additionalCategories: [AdditionalCategorySchema],

    // Version for future migrations if needed
    version: { type: Number, default: 1 }
}, {
    _id: false,
    timestamps: true
});

export default mongoose.models.AppSettings || mongoose.model("AppSettings", AppSettingsSchema);