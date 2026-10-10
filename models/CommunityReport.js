import mongoose from 'mongoose'
const schema = new mongoose.Schema({
  reportId: { type: String, required: true }, entryId: { type: String, required: true },
  entryRevision: { type: Number, required: true }, reporterUserId: { type: String, required: true },
  reason: String, details: { type: String, maxlength: 1000 }, snapshot: mongoose.Schema.Types.Mixed,
  status: { type: String, enum: ['open', 'resolved'], default: 'open' }, createdAt: Date,
  resolvedAt: Date, resolvedBy: String, resolutionNote: { type: String, maxlength: 500 },
}, { collection: 'communityreports', autoIndex: false, autoCreate: false })
schema.index({ reportId: 1 }, { unique: true })
schema.index({ entryId: 1, entryRevision: 1, reporterUserId: 1 }, { unique: true })
schema.index({ status: 1, createdAt: -1, reportId: -1 })
export default mongoose.models.CommunityReport || mongoose.model('CommunityReport', schema)
