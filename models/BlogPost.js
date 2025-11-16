import mongoose from 'mongoose';

const BlogPostSchema = new mongoose.Schema({
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    authorId: { type: String },
    excerpt: { type: String },
    content: { type: String }, // markdown
    heroImage: { type: String }, // s3 key or url
    cta: {
        tag: { type: String },
        text: { type: String },
        url: { type: String }
    },
    tags: [String],
    categories: [String],
    featured: { type: Boolean, default: false },
    published: { type: Boolean, default: false },
    publishDate: { type: Date },
    metaTitle: { type: String },
    metaDescription: { type: String },
    readingTimeMinutes: { type: Number },
}, { timestamps: true });

export default mongoose.models.BlogPost || mongoose.model('BlogPost', BlogPostSchema);
