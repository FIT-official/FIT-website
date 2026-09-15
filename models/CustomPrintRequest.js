import mongoose from 'mongoose'

const CustomPrintRequestSchema = new mongoose.Schema({
    // Request identification
    requestId: { type: String, required: true, unique: true },

    // User info
    userId: { type: String, required: true }, // Clerk user ID
    userEmail: { type: String, required: true },
    userName: { type: String, required: true },

    // Where this request came from:
    //   - 'upload'  — customer uploaded their own model (the original flow).
    //   - 'product' — a productType:"print" product bought with print delivery;
    //                 fixed vendor print config + fixed quote, customer picks
    //                 colour only. `modelFile.s3Key` reuses the product model.
    // See openspec change `migrate-print-delivery-to-custom-requests`.
    source: { type: String, enum: ['upload', 'product'], default: 'upload' },

    // Who fulfils the job. null = Fix It Today (the original behaviour);
    // otherwise the Clerk userId of a creator whose CreatorPrintService was
    // enabled when the request was created (/prints/request?creator=).
    creatorUserId: { type: String, default: null, index: true },
    // Free-text brief from the customer (deadline, finish, colour notes).
    customerNote: { type: String, default: '', maxlength: 1000 },
    sourceProduct: {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
        variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    },

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
        // Generic (simple-mode) selection — kept alongside printSettings so the
        // cart can show the friendly view (Strength/Quality/Colour) for instant
        // quotes without recomputing it from the advanced settings.
        generic: {
            strength: { type: String, default: null },
            quality: { type: String, default: null },
            colour: { type: String, default: null },
            material: { type: String, default: null },
        },
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

    // Instant Quoting Engine result (server-authoritative breakdown). Set when
    // the request is auto-quoted; mirrors lib/quoting/quote.js output shape.
    quote: {
        currency: { type: String },
        lines: [{
            key: { type: String },
            label: { type: String },
            amount: { type: Number },
            _id: false,
        }],
        subtotal: { type: Number },
        expedite: {
            applied: { type: Boolean, default: false },
            mode: { type: String },
            amount: { type: Number, default: 0 },
        },
        total: { type: Number },
        confidence: { type: String, enum: ['high', 'low'] },
        inputs: {
            volumeCm3: { type: Number },
            weightGrams: { type: Number },
            printHours: { type: Number },
            // Shape-aware layer-stack estimate, recorded for print-farm
            // validation only — NOT priced (see add-lightweight-print-time-estimator).
            printHoursShapeAware: { type: Number },
        },
    },
    quotedAt: { type: Date },

    // How this request was quoted:
    //   - 'instant' — server-authoritative price from the Instant Quoting Engine.
    //   - 'manual'  — admin reviewed advanced settings and set the price.
    quoteMode: { type: String, enum: ['instant', 'manual'], default: null },

    // Payment info
    stripeSessionId: { type: String },
    stripePaymentIntentId: { type: String },
    paidAt: { type: Date },

    // Deadlines and reminders
    configDeadline: { type: Date }, // 7 days from payment
    reminderSent: { type: Boolean, default: false },
    autoCancelledAt: { type: Date },
    // When we last sent a pre-payment "idle / unconfigured" nudge (distinct from
    // the post-payment configDeadline reminder above). Drives the nudge cron's
    // cooldown so customers aren't emailed repeatedly.
    idleNudgeSentAt: { type: Date, default: null },

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

