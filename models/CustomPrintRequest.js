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
        originalName: { type: String, required: false },
        s3Key: { type: String, required: false }, // S3 storage key
        s3Url: { type: String, required: false }, // Public URL
        fileSize: { type: Number, required: false }, // in bytes
        // Only set when an actual model is uploaded.
        uploadedAt: { type: Date, required: false }
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
        enum: ['pending_upload', 'pending_config', 'configured', 'quoted', 'payment_pending', 'paid', 'printing', 'printed', 'shipped', 'delivered', 'cancelled'],
        default: 'pending_upload'
    },

    // Pricing
    basePrice: { type: Number, required: true, default: 0 }, // Base print cost (copied from product at request creation)
    printFee: { type: Number, default: 0 }, // Admin-specified extra print fee
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

    // Available delivery types for this request (admin can set, customer picks from these)
    delivery: {
        deliveryTypes: [
            {
                type: { type: String, required: true },
                price: { type: Number, required: false, default: 0 },
                customPrice: { type: Number, default: null, required: false },
                customDescription: { type: String, default: null, required: false },
                pickupLocation: { type: String, default: null, required: false },
                deliveryTypeConfigId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'AppSettings.additionalDeliveryTypes',
                    required: false
                },
            }
        ]
    },

    // Dimensions (used for delivery pricing)
    dimensions: {
        length: { type: Number, default: null }, // cm
        width: { type: Number, default: null },  // cm
        height: { type: Number, default: null }, // cm
        weight: { type: Number, default: null }  // kg
    },

    trackingNumber: { type: String },
    estimatedDelivery: { type: Date },
    deliveredAt: { type: Date },

    // Admin notes and history
    adminNote: { type: String },
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

// In Next.js dev with hot reload, Mongoose can keep an old compiled model/schema.
// If the schema changes (e.g. adding `dimensions`), the cached model may silently drop fields.
if (process.env.NODE_ENV === 'development' && mongoose.models.CustomPrintRequest) {
    delete mongoose.models.CustomPrintRequest
}

export default mongoose.model('CustomPrintRequest', CustomPrintRequestSchema)

