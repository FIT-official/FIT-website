import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  creatorUserId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: false },
  // Legacy bounded catalog, migrated to separate offer documents on next write.
  catalog: { type: mongoose.Schema.Types.Mixed },
  revision: { type: Number, default: 0, min: 0 },
  migrationToken: { type: String },
  migrationStartedAt: { type: Date },
}, { timestamps: true })

export default mongoose.models.CreatorFabricationService || mongoose.model('CreatorFabricationService', schema)
