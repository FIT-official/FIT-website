import mongoose from 'mongoose'

// A reservation is taken before creating a product/request. The unique key and
// conditional increment make concurrent requests share the same allowance.
const CreatorQuotaSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  used: { type: Number, required: true, min: 0 },
}, { timestamps: true })

export default mongoose.models.CreatorQuota || mongoose.model('CreatorQuota', CreatorQuotaSchema)
