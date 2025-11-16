import mongoose from "mongoose";

const PricingTierSchema = new mongoose.Schema({
    minVolume: { type: Number, required: true, min: 0 }, // in cm³
    maxVolume: { type: Number, required: true, min: 0 }, // in cm³
    minWeight: { type: Number, required: true, min: 0 }, // in grams
    maxWeight: { type: Number, required: true, min: 0 }, // in grams
    price: { type: Number, required: true, min: 0 } // in SGD
}, { _id: false });

const AdditionalDeliveryTypeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    displayName: { type: String, required: true },
    description: { type: String, default: "" },
    applicableToProductTypes: [{ type: String, enum: ["shop", "print"] }],
    pricingTiers: [PricingTierSchema], // Array of pricing rules based on dimensions/weight
    hasDefaultPrice: { type: Boolean, default: false }, // If false, creator must set price
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
}, { _id: true });

const AdditionalOrderStatusSchema = new mongoose.Schema({
    statusKey: { type: String, required: true },
    displayName: { type: String, required: true },
    description: { type: String, default: "" },
    orderType: { type: String, enum: ["order", "printOrder"], required: true },
    color: { type: String, default: "#6b7280" },
    icon: { type: String, default: "TbTruckDelivery" }, // Icon component name
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
}, { _id: true });

const AdditionalCategorySchema = new mongoose.Schema({
    name: { type: String, required: true },
    displayName: { type: String, required: true },
    type: { type: String, enum: ["shop", "print"], required: true },
    description: { type: String, default: "" },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    // Optional subcategories stored as embedded documents
    subcategories: [{
        name: { type: String, required: true },
        displayName: { type: String, required: true },
        isActive: { type: Boolean, default: true }
    }]
}, { _id: true });

const AppSettingsSchema = new mongoose.Schema({
    // There should only be one settings document
    _id: { type: String, default: "app-settings" },

    // Additional delivery types - fully customizable with pricing tiers
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