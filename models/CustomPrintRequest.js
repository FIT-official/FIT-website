import mongoose from 'mongoose'

const CustomPrintRequestSchema = new mongoose.Schema({
    // Request identification
    requestId: { type: String, required: true, unique: true },

    // User info
    userId: { type: String, required: true }, // Clerk user ID
    userEmail: { type: String, required: true },
    userName: { type: String, required: true },

    // Uploaded model
    modelFile: {
        originalName: { type: String, required: true },
        s3Key: { type: String, required: true }, // S3 storage key
        s3Url: { type: String, required: true }, // Public URL
        fileSize: { type: Number, required: true }, // in bytes
        uploadedAt: { type: Date, default: Date.now }
    },

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

    // Order status
    status: {
        type: String,
        enum: ['pending_upload', 'pending_config', 'configured', 'payment_pending', 'paid', 'printing', 'printed', 'shipped', 'delivered', 'cancelled'],
        default: 'pending_upload'
    },

    // Pricing
    basePrice: { type: Number, required: true, default: 0 }, // Base print cost
    printFee: { type: Number, default: 0 }, // Calculated based on volume/material
    deliveryFee: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    currency: { type: String, default: 'sgd' },

    // Payment info
    stripeSessionId: { type: String },
    stripePaymentIntentId: { type: String },
    paidAt: { type: Date },

    // Deadlines and reminders
    configDeadline: { type: Date }, // 7 days from payment
    reminderSent: { type: Boolean, default: false },
    autoCancelledAt: { type: Date },

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

    // Chosen delivery type for this request (e.g. local-pickup, express-courier)
    deliveryType: { type: String },

    trackingNumber: { type: String },
    estimatedDelivery: { type: Date },
    deliveredAt: { type: Date },

    // Admin notes and history
    notes: { type: String },
    statusHistory: [{
        status: { type: String, required: true },
        updatedAt: { type: Date, default: Date.now },
        note: { type: String }
    }]
}, {
    timestamps: true
})

// Indexes for efficient queries
CustomPrintRequestSchema.index({ userId: 1, status: 1 })
CustomPrintRequestSchema.index({ requestId: 1 })
CustomPrintRequestSchema.index({ configDeadline: 1, status: 1 })
CustomPrintRequestSchema.index({ status: 1, paidAt: 1 })

// Auto-set config deadline when payment is made
CustomPrintRequestSchema.pre('save', function (next) {
    if (this.isModified('paidAt') && this.paidAt && !this.configDeadline) {
        this.configDeadline = new Date(this.paidAt.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days from payment
    }
    next()
})

export default mongoose.models.CustomPrintRequest || mongoose.model('CustomPrintRequest', CustomPrintRequestSchema)
