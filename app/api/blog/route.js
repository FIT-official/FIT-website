import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import BlogPost from '@/models/BlogPost';
import { statusQuery } from '@/lib/blog/status';
import { BLOG_SORT_INDEX, ensureBlogSortIndex } from '@/lib/blog/sortIndex';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public list: published posts only (effectiveStatus semantics: `status` is
// authoritative, legacy docs fall back to `published`), lean card fields
// (never body content — imported posts carry up to 700KB of raw HTML).
export async function GET() {
    await connectToDatabase();
    await ensureBlogSortIndex();
    const posts = await BlogPost.find(statusQuery('published'))
        .select('title slug excerpt heroImage tags categories featured publishDate createdAt readingTimeMinutes')
        .sort({ publishDate: -1, createdAt: -1 })
        .hint(BLOG_SORT_INDEX)
        .limit(200)
        .lean();
    return NextResponse.json({ ok: true, posts });
}
