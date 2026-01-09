import mongoose from "mongoose";

const PricingTierSchema = new mongoose.Schema({
    minVolume: { type: Number, required: true, min: 0 }, // in cm³
    maxVolume: { type: Number, required: true, min: 0 }, // in cm³
    minWeight: { type: Number, required: true, min: 0 }, // in grams
    maxWeight: { type: Number, required: true, min: 0 }, // in grams
    price: { type: Number, required: true, min: 0 } // in SGD
}, { _id: false });

const BasePricingSchema = new mongoose.Schema({
    basePrice: { type: Number, default: null },
    volumeFactor: { type: Number, default: null },
    weightFactor: { type: Number, default: null },
    minPrice: { type: Number, default: null },
    maxPrice: { type: Number, default: null },
    freeShippingThreshold: { type: Number, default: null }
}, { _id: false });

const AdditionalDeliveryTypeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    displayName: { type: String, required: true },
    description: { type: String, default: "" },
    applicableToProductTypes: [{ type: String, enum: ["shop", "print"] }],
    // Only one pricing system should be present: either pricingTiers or basePricing
    pricingTiers: {
        type: [PricingTierSchema],
        default: undefined,
        required: false
    },
    basePricing: {
        type: BasePricingSchema,
        default: undefined,
        required: false
    },
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

    // Stripe price tiers for this environment (object: { tier1, tier2, tier3, tier4 })
    stripePriceTiers: {
        type: Object,
        default: undefined
    },

    // Environment: 'production' or 'development'
    env: {
        type: String,
        enum: ['production', 'development'],
        default: 'production'
    },

    // Version for future migrations if needed
    version: { type: Number, default: 1 }
}, {
    timestamps: true
});

let AppSettingsModel;
if (mongoose.models && mongoose.models.AppSettings) {
    AppSettingsModel = mongoose.models.AppSettings;
} else if (globalThis.AppSettingsModel) {
    AppSettingsModel = globalThis.AppSettingsModel;
} else {
    AppSettingsModel = mongoose.model("AppSettings", AppSettingsSchema);
    globalThis.AppSettingsModel = AppSettingsModel;
}
export default AppSettingsModel;