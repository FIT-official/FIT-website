import mongoose from 'mongoose';

const BlogPostSchema = new mongoose.Schema({
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    authorId: { type: String },
    excerpt: { type: String },
    content: { type: String }, // markdown (legacy posts)
    // Rich-text posts: TipTap JSON + which format this post uses. Existing
    // documents default to markdown so they keep their editor and renderer.
    contentJson: { type: mongoose.Schema.Types.Mixed },
    contentFormat: { type: String, enum: ['markdown', 'tiptap'], default: 'markdown' },
    heroImage: { type: String }, // s3 key or url
    cta: {
        tag: { type: String },
        text: { type: String },
        url: { type: String }
    },
    tags: [String],
    categories: [String],
    featured: { type: Boolean, default: false },
    // `status` and `published` are kept in sync on every write. No schema
    // default: legacy docs lack `status`, and defaulting to 'draft' would
    // misreport published legacy posts — use effectiveStatus() to read.
    status: { type: String, enum: ['draft', 'published', 'hidden', 'unlisted'] },
    published: { type: Boolean, default: false },
    publishDate: { type: Date },
    scheduledFor: { type: Date }, // draft + scheduledFor <= now → cron publishes
    metaTitle: { type: String },
    metaDescription: { type: String },
    readingTimeMinutes: { type: Number },
}, { timestamps: true });

export default mongoose.models.BlogPost || mongoose.model('BlogPost', BlogPostSchema);
