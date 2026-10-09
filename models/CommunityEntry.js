import mongoose from 'mongoose'
const schema = new mongoose.Schema({
  entryId: { type: String, required: true }, ownerUserId: { type: String, required: true },
  clientRequestId: { type: String, required: true }, submissionFingerprint: { type: String, required: true },
  kind: { type: String, enum: ['question', 'project', 'comment'], required: true }, parentId: { type: String, default: null },
  displayName: { type: String, required: true, maxlength: 40 }, title: { type: String, maxlength: 120 },
  body: { type: String, required: true, maxlength: 6000 }, topic: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'hidden', 'withdrawn'], default: 'pending' },
  revision: { type: Number, default: 1 }, createdAt: Date, updatedAt: Date, publishedAt: Date,
  moderationNote: { type: String, maxlength: 500, default: '' }, audit: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { collection: 'communityentries', autoIndex: false, autoCreate: false })
schema.index({ entryId: 1 }, { unique: true })
schema.index({ ownerUserId: 1, clientRequestId: 1 }, { unique: true })
schema.index({ status: 1, parentId: 1, createdAt: -1, entryId: -1 })
schema.index({ ownerUserId: 1, createdAt: -1, entryId: -1 })
export default mongoose.models.CommunityEntry || mongoose.model('CommunityEntry', schema)
