import mongoose from 'mongoose'
const schema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true }, revision: { type: Number, default: 0 },
  restrictedUntil: { type: Date, default: null }, postingSuspended: { type: Boolean, default: false },
  audit: { type: [new mongoose.Schema({
    operationId: { type: String, required: true }, actorUserId: { type: String, required: true },
    action: { type: String, required: true }, reason: { type: String, required: true, maxlength: 500 },
    at: { type: Date, required: true }, until: { type: Date, default: null }, sourceEntryId: { type: String, required: true },
    fingerprint: { type: String, required: true },
  }, { _id: false })], default: [] },
}, { timestamps: true })
export default mongoose.models.CommunityAccountState || mongoose.model('CommunityAccountState', schema)
