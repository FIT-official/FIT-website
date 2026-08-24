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
    version: { type: Number, default: 1 },

    // Print pricing formula for auto-calculating custom print quotes
    // (LEGACY: superseded by quotingConfig + the Instant Quoting Engine; kept
    // until the admin "calculate print cost" tool migrates).
    printPricingFormula: {
        baseFee: { type: Number, default: 5 },
        materialCostPerGram: { type: Number, default: 0.05 },
        supportMultiplier: { type: Number, default: 1.2 },
        highQualityMultiplier: { type: Number, default: 1.5 },
        markupPercentage: { type: Number, default: 30 },
    },

    // Instant Quoting Engine configuration (see lib/quoting/pricingDefaults.js).
    // Money in major units (SGD); material rate per gram, time rate per hour.
    quotingConfig: {
        materialRatePerGram: { type: Number, default: 0.02, min: 0 }, // $20/kg
        printTimeRatePerHour: { type: Number, default: 3, min: 0 },   // $3/hr
        baseFee: { type: Number, default: 0, min: 0 },
        postProcessingFee: { type: Number, default: 0, min: 0 },
        specialRequestFee: { type: Number, default: 0, min: 0 },
        priorityFee: { type: Number, default: 0, min: 0 },
        expediteMode: { type: String, enum: ['percent', 'flat', 'greater'], default: 'greater' },
        expediteSurchargePercent: { type: Number, default: 50, min: 0 },
        expediteSurchargeFlat: { type: Number, default: 20, min: 0 },
        minimumPrice: { type: Number, default: 5, min: 0 },
        // Optional per-material density overrides (g/cm³): { pla: 1.24, ... }
        materialDensities: { type: Map, of: Number, default: undefined },
        // Machine-speed model for the print-time estimate (null = built-in
        // default; see lib/quoting/pricingDefaults.DEFAULT_TIME_MODEL).
        // (min:0 validators skip null, so "unset = built-in default" is preserved.)
        timeModel: {
            baseFlowCm3PerHour: { type: Number, default: null, min: 0 },
            layerHeightRefMm: { type: Number, default: null, min: 0 },
            supportTimeFactor: { type: Number, default: null, min: 0 },
            wallTimeFactorPerLoop: { type: Number, default: null, min: 0 },
            minHours: { type: Number, default: null, min: 0 },
        },
        // Shape-aware (layer-stack) estimator constants, fitted from the
        // admin's timed test prints (Print Timing panel). Null = built-in
        // defaults (lib/quoting/printTime/layerStack.DEFAULT_LAYER_STACK_MODEL).
        layerStackModel: {
            flowMm3PerS: { type: Number, default: null, min: 0 },
            perLayerOverheadS: { type: Number, default: null, min: 0 },
        },
    },

    // Timed test prints for calibrating the shape-aware print-time estimator.
    // Only derived shape components are stored — model bytes are parsed once
    // at upload and discarded.
    printTimeCalibration: {
        samples: {
            type: [{
                label: { type: String, default: '' },
                fileName: { type: String, default: '' },
                settings: {
                    layerHeightMm: { type: Number, default: 0.2 },
                    infillPercent: { type: Number, default: 20 },
                    wallLoops: { type: Number, default: 2 },
                    enableSupport: { type: Boolean, default: false },
                },
                extrudedMm3: { type: Number, required: true },
                totalLayers: { type: Number, required: true },
                supportOn: { type: Boolean, default: false },
                actualHours: { type: Number, default: null },
                createdAt: { type: Date, default: Date.now },
            }],
            default: [],
        },
        fittedAt: { type: Date, default: null },
    },

    // Print-farm machine capacity (admin-entered; null = no limit enforced).
    // Used to reject un-printable models at quote time and to catch unit typos
    // on the admin dimension endpoints. Dimensions in cm, weight in kg.
    machineLimits: {
        maxLengthCm: { type: Number, default: null },
        maxWidthCm: { type: Number, default: null },
        maxHeightCm: { type: Number, default: null },
        maxWeightKg: { type: Number, default: null },
    },

    // Available colours/materials for generic print configuration. Seeded from
    // lib/quoting/genericPresets DEFAULT_PRINT_COLOURS; admins curate to stock.
    // `material` (optional) maps to a quoting density key; `priceModifier`
    // (optional) is reserved for per-colour surcharges.
    printColours: {
        type: [{
            name: { type: String, required: true },
            hex: { type: String, required: true },
            material: { type: String, default: null },
            priceModifier: { type: Number, default: null },
            _id: false,
        }],
        default: undefined,
    }
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