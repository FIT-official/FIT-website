import mongoose from 'mongoose';
const schema = new mongoose.Schema({
    _id: String, ownerId: { type: String, required: true }, count: { type: Number, default: 0 }, bytes: { type: Number, default: 0 },
}, { timestamps: true });
export default mongoose.models.UploadBatch || mongoose.model('UploadBatch', schema);
