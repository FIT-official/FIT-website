import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  creatorUserId: { type: String, required: true },
  offerId: { type: String, required: true },
  enabled: { type: Boolean, default: false, required: true },
  offer: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true })
schema.index({ creatorUserId: 1, offerId: 1 }, { unique: true })
schema.index({ creatorUserId: 1, enabled: 1, offerId: 1 })
schema.index({ creatorUserId: 1, enabled: 1, 'offer.template.assetId': 1 })

export default mongoose.models.CreatorFabricationOffer || mongoose.model('CreatorFabricationOffer', schema)
