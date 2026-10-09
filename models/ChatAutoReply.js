import mongoose from 'mongoose'

// The built-in unique _id index arbitrates concurrent welcome attempts without
// relying on a separately provisioned index or a process-local cache.
const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  channelId: { type: String, required: true },
  responderId: { type: String, required: true },
  status: { type: String, enum: ['claimed', 'sent', 'uncertain'], required: true },
}, { timestamps: true })

export default mongoose.models.ChatAutoReply || mongoose.model('ChatAutoReply', schema)
