import mongoose from 'mongoose'

// DEPRECATED: This model is being phased out in favor of CustomPrintRequest
// Print orders are now handled as custom upload requests, not product-based orders
const PrintOrderSchema = new mongoose.Schema({
    // Order identification
    orderId: { type: String, required: true, unique: true },
    stripeSessionId: { type: String, required: true },

    // User and product info (LEGACY - for backwards compatibility)
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },

    productTitle: { type: String },
    quantity: { type: Number, default: 1 },
    basePrice: { type: Number, required: true }, // Original product price
    printFee: { type: Number, required: true }, // Additional printing cost
    deliveryFee: { type: Number, required: true }, // Shipping cost
    totalAmount: { type: Number, required: true }, // Total paid amount

    // Custom print request reference (NEW)
    customPrintRequestId: { type: mongoose.Schema.Types.ObjectId, ref: "CustomPrintRequest" },
    isCustomUpload: { type: Boolean, default: false }

    // Print configuration
    printConfiguration: {
        meshColors: { type: Map, of: String }, // { meshName: colorHex }
        printSettings: {
            // Layer Height
            layerHeight: { type: Number, default: 0.2 },
            initialLayerHeight: { type: Number, default: 0.2 },

            // Material
            materialType: { type: String, enum: ['plastic', 'resin', 'metal', 'sandstone'], default: 'plastic' },

            // Walls
            wallLoops: { type: Number, default: 2 },
            internalSolidInfillPattern: { type: String, default: 'Rectilinear' },

            // Infill
            sparseInfillDensity: { type: Number, default: 20 },
            sparseInfillPattern: { type: String, default: 'Rectilinear' },

            // Nozzle
            nozzleDiameter: { type: Number, default: 0.4 },

            // Support
            enableSupport: { type: Boolean, default: false },
            supportType: { type: String, enum: ['Tree', 'Normal'], default: 'Normal' },

            // Print plate
            printPlate: { type: String, enum: ['Textured', 'Smooth'], default: 'Textured' }
        },
        configuredAt: { type: Date }, // When user submitted config
        isConfigured: { type: Boolean, default: false }
    },

    // Order status and tracking
    status: {
        type: String,
        enum: ['pending_config', 'configured', 'printing', 'printed', 'shipped', 'delivered', 'cancelled'],
        default: 'pending_config'
    },

    // Digital transaction reference
    digitalTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: "DigitalProductTransaction" },

    // Timestamps and reminders
    createdAt: { type: Date, default: Date.now },
    configDeadline: { type: Date }, // 1 week from creation
    reminderSent: { type: Boolean, default: false },

    // Status updates
    statusHistory: [{
        status: { type: String, required: true },
        updatedAt: { type: Date, default: Date.now },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        notes: { type: String }
    }],

    // Delivery information
    shippingAddress: {
        name: { type: String },
        address1: { type: String },
        address2: { type: String },
        city: { type: String },
        state: { type: String },
        postalCode: { type: String },
        country: { type: String }
    },

    trackingNumber: { type: String },
    estimatedDelivery: { type: Date },
    deliveredAt: { type: Date }
}, {
    timestamps: true
})

// Index for efficient queries
PrintOrderSchema.index({ userId: 1, status: 1 })
PrintOrderSchema.index({ creatorId: 1, status: 1 })
PrintOrderSchema.index({ orderId: 1 })
PrintOrderSchema.index({ configDeadline: 1, status: 1 })

// Auto-set config deadline on creation
PrintOrderSchema.pre('save', function (next) {
    if (this.isNew && !this.configDeadline) {
        this.configDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 1 week from now
    }
    next()
})

export default mongoose.models.PrintOrder || mongoose.model('PrintOrder', PrintOrderSchema)