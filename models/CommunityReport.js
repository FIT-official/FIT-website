import mongoose from 'mongoose'
const schema = new mongoose.Schema({
  entryId: { type: String, required: true }, reporterUserId: { type: String, required: true },
  reason: { type: String, enum: ['harassment', 'threats', 'spam', 'privacy', 'impersonation', 'other'], required: true },
  detail: { type: String, maxlength: 500, default: '' }, resolved: { type: Boolean, default: false },
  resolvedBy: { type: String, default: null }, resolvedAt: { type: Date, default: null },
}, { timestamps: true })
schema.index({ entryId: 1, reporterUserId: 1 }, { unique: true })
schema.index({ resolved: 1, createdAt: -1 })
export default mongoose.models.CommunityReport || mongoose.model('CommunityReport', schema)
