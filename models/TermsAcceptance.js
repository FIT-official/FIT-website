import mongoose from 'mongoose'

const schema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      maxlength: 128,
    },
    context: {
      type: String,
      required: true,
      enum: [
        'checkout',
        'repair_booking',
        'signup',
        'creator_onboarding',
      ],
    },
    document: {
      type: String,
      required: true,
      enum: ['customer', 'creator'],
    },
    termsVersion: {
      type: String,
      required: true,
    },
    sourceSha256: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/,
    },
    referenceId: {
      type: String,
      required: true,
    },
    acceptedAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    strict: 'throw',
  }
)

schema.index(
  {
    userId: 1,
    context: 1,
    referenceId: 1,
    document: 1,
    termsVersion: 1,
    sourceSha256: 1,
  },
  { unique: true }
)

export default mongoose.models.TermsAcceptance ||
  mongoose.model('TermsAcceptance', schema)
