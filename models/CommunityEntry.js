import mongoose from 'mongoose'
const audit = new mongoose.Schema({
  operationId: { type: String, required: true }, actorUserId: { type: String, required: true },
  action: { type: String, required: true }, reason: { type: String, required: true, maxlength: 500 },
  fingerprint: { type: String, required: true }, abuseReason: { type: String, default: null },
  at: { type: Date, required: true },
}, { _id: false })
const schema = new mongoose.Schema({
  entryId: { type: String, required: true, unique: true }, kind: { type: String, enum: ['blog_comment', 'shop_review', 'shop_reply'], required: true },
  subject: { type: String, required: true, maxlength: 160 }, authorUserId: { type: String, required: true },
  publicName: { type: String, required: true, maxlength: 50 }, body: { type: String, required: true, maxlength: 1500 },
  rating: { type: Number, min: 1, max: 5, default: null },
  verifiedOrderKey: { type: String, default: undefined }, replyTo: { type: String, default: undefined },
  clientRequestId: { type: String, required: true }, submissionFingerprint: { type: String, required: true },
  visibility: { type: String, enum: ['visible', 'hidden'], default: 'visible' },
  flags: { type: [String], default: [] }, abuseConfirmed: { type: Boolean, default: false },
  revision: { type: Number, default: 0 }, audit: { type: [audit], default: [] },
}, { timestamps: true })
schema.index({ authorUserId: 1, clientRequestId: 1 }, { unique: true })
schema.index({ verifiedOrderKey: 1 }, { unique: true, partialFilterExpression: { kind: 'shop_review' } })
schema.index({ replyTo: 1 }, { unique: true, partialFilterExpression: { kind: 'shop_reply' } })
schema.index({ subject: 1, kind: 1, visibility: 1, createdAt: -1, entryId: -1 })
schema.index({ authorUserId: 1, abuseConfirmed: 1 })
export default mongoose.models.CommunityEntry || mongoose.model('CommunityEntry', schema)
