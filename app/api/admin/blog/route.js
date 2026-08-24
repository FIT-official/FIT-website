import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import BlogPost from '@/models/BlogPost';
import { sanitizeString } from "@/utils/validate";
import { authenticate, unauthorizedResponse } from "@/lib/authenticate";
import { checkAdminPrivileges } from "@/lib/checkPrivileges";
import { readingTimeMinutes } from '@/lib/blog/readingTime';
import { extractTextFromTiptap } from '@/lib/blog/tiptapText';
import { statusWrite, effectiveStatus, statusQuery } from '@/lib/blog/status';
import { normalizeToTiptap } from '@/lib/blog/normalizeContent';
import { getPostHogClient } from '@/lib/posthog-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function computeReadingTime(body) {
    if (body.contentFormat === 'tiptap') {
        const text = extractTextFromTiptap(body.contentJson);
        if (text.trim()) return readingTimeMinutes(text);
        // htmlBlock-converted legacy posts extract no plain text: fall back to
        // the preserved raw content, tags stripped.
        return readingTimeMinutes(String(body.content || '').replace(/<[^>]*>/g, ' '));
    }
    return readingTimeMinutes(body.content || '');
}

// Create or update a blog post. If `slug` or `_id` provided, update; otherwise create.
export async function POST(req) {
    let userId;
    try {
        ({ userId } = await authenticate(req));
    } catch {
        return unauthorizedResponse();
    }
    const isAdmin = await checkAdminPrivileges(userId);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    await connectToDatabase();

    const requestedStatus = body.status || (body.published ? 'published' : 'draft');

    // The legacy 'markdown' format is retired: whatever shape arrives (tiptap
    // JSON, raw HTML, or markdown, e.g. from the import pipeline), it is
    // normalized to TipTap on write. The raw source stays in `content`.
    const normalized = normalizeToTiptap(body);

    const data = {
        title: body.title,
        excerpt: body.excerpt || '',
        content: body.content || '',
        contentJson: normalized.contentJson,
        contentFormat: 'tiptap',
        heroImage: body.heroImage || '',
        cta: body.cta || {},
        tags: body.tags || [],
        categories: body.categories || [],
        featured: !!body.featured,
        scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
        metaTitle: body.metaTitle || '',
        metaDescription: body.metaDescription || '',
        readingTimeMinutes: computeReadingTime({ ...body, contentFormat: 'tiptap', contentJson: normalized.contentJson }),
    };

    // make slug from provided slug or title
    const slugSource = (body.slug && body.slug.trim()) || body.title || '';
    const slug = sanitizeString(slugSource).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 200);
    data.slug = slug;

    let post;
    if (body._id) {
        const existing = await BlogPost.findById(body._id).lean();
        Object.assign(data, statusWrite(requestedStatus, existing?.publishDate));
        post = await BlogPost.findByIdAndUpdate(body._id, { ...data }, { new: true, upsert: true });
    } else if (body.slug) {
        const existing = await BlogPost.findOne({ slug: body.slug }).lean();
        Object.assign(data, statusWrite(requestedStatus, existing?.publishDate));
        post = await BlogPost.findOneAndUpdate({ slug: body.slug }, { ...data }, { new: true, upsert: true });
    } else {
        Object.assign(data, statusWrite(requestedStatus, body.publishDate ? new Date(body.publishDate) : null));
        // ensure unique slug
        let uniqueSlug = data.slug || 'post';
        let counter = 0;
        while (await BlogPost.findOne({ slug: uniqueSlug })) {
            counter += 1;
            uniqueSlug = `${data.slug}-${counter}`;
        }
        data.slug = uniqueSlug;
        data.authorId = userId;
        post = await BlogPost.create(data);
    }

    if (data.status === 'published') {
        try {
            getPostHogClient().capture({
                distinctId: userId,
                event: 'blog_post_published',
                properties: {
                    slug: post.slug,
                    content_format: post.contentFormat,
                    reading_time_minutes: post.readingTimeMinutes || 0,
                    featured: !!post.featured,
                },
            });
        } catch (phErr) {
            console.error('PostHog blog_post_published capture failed:', phErr);
        }
    }

    return NextResponse.json({ ok: true, post });
}

// Lean list-card projection: NEVER content/contentJson (imported posts carry
// hundreds of KB of raw HTML each). `published` rides along only so
// effectiveStatus() can resolve legacy docs and existing callers keep working.
const LIST_FIELDS =
    'title slug excerpt heroImage status published scheduledFor publishDate createdAt updatedAt featured tags categories contentFormat readingTimeMinutes';

const DEFAULT_PAGE_SIZE = 8;
const MAX_PAGE_SIZE = 50;

// Admin-only list / fetch (drafts included). The public site uses /api/blog.
// - `?slug=<slug>`: the FULL single post (the editor loads one this way).
// - `?all=1`: every post, lean card fields only (newsletter composer).
// - default: paginated lean cards — `page` (1-based), `limit` (default 8,
//   max 50), optional `status` filter with effectiveStatus semantics.
export async function GET(req) {
    let userId;
    try {
        ({ userId } = await authenticate(req));
    } catch {
        return unauthorizedResponse();
    }
    const isAdmin = await checkAdminPrivileges(userId);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const url = new URL(req.url);
    const slug = url.searchParams.get('slug');

    await connectToDatabase();

    if (slug) {
        const post = await BlogPost.findOne({ slug }).lean();
        if (!post) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
        post.status = effectiveStatus(post);
        // Read-side safety net: the editor only speaks TipTap. Any doc that
        // slipped in as legacy (older imports) is normalized in the response;
        // the next save persists the normalized form.
        if (post.contentFormat !== 'tiptap' || !post.contentJson) {
            const normalized = normalizeToTiptap(post);
            post.contentFormat = 'tiptap';
            post.contentJson = normalized.contentJson;
        }
        return NextResponse.json({ ok: true, post });
    }

    const filter = statusQuery(url.searchParams.get('status'));

    if (url.searchParams.get('all') === '1') {
        const posts = await BlogPost.find(filter).select(LIST_FIELDS).sort({ createdAt: -1 }).lean();
        for (const p of posts) p.status = effectiveStatus(p);
        return NextResponse.json({ ok: true, posts, total: posts.length });
    }

    const page = Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || DEFAULT_PAGE_SIZE));

    const [total, posts, statusRows] = await Promise.all([
        BlogPost.countDocuments(filter),
        BlogPost.find(filter)
            .select(LIST_FIELDS)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        // Tab counts across ALL posts (cheap: two tiny fields per doc).
        BlogPost.find({}).select('status published').lean(),
    ]);
    for (const p of posts) p.status = effectiveStatus(p);

    const counts = { all: statusRows.length, published: 0, draft: 0, hidden: 0 };
    for (const row of statusRows) {
        const s = effectiveStatus(row);
        counts[s] = (counts[s] || 0) + 1;
    }

    const totalPages = Math.max(1, Math.ceil(total / limit));
    return NextResponse.json({ ok: true, posts, page, totalPages, total, counts });
}

export async function DELETE(req) {
    let userId;
    try {
        ({ userId } = await authenticate(req));
    } catch {
        return unauthorizedResponse();
    }
    const isAdmin = await checkAdminPrivileges(userId);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    if (!body.slug && !body._id) return NextResponse.json({ ok: false, error: 'missing identifier' }, { status: 400 });
    await connectToDatabase();
    if (body._id) await BlogPost.findByIdAndDelete(body._id);
    else await BlogPost.findOneAndDelete({ slug: body.slug });
    return NextResponse.json({ ok: true });
}
