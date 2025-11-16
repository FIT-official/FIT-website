import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import BlogPost from '@/models/BlogPost';
import { sanitizeString } from "@/utils/validate";
import { authenticate } from "@/lib/authenticate";
import { checkAdminPrivileges } from "@/lib/checkPrivileges";

// Create or update a blog post. If `slug` or `_id` provided, update; otherwise create.
export async function POST(req) {
    const { userId } = await authenticate(req);
    const isAdmin = await checkAdminPrivileges(userId);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    await connectToDatabase();

    const data = {
        title: body.title,
        excerpt: body.excerpt || '',
        content: body.content || '',
        heroImage: body.heroImage || '',
        cta: body.cta || {},
        tags: body.tags || [],
        categories: body.categories || [],
        featured: !!body.featured,
        published: !!body.published,
        publishDate: body.publishDate ? new Date(body.publishDate) : (body.published ? new Date() : null),
        metaTitle: body.metaTitle || '',
        metaDescription: body.metaDescription || '',
        readingTimeMinutes: body.readingTimeMinutes || 0,
    };

    // make slug from provided slug or title
    const slugSource = (body.slug && body.slug.trim()) || body.title || '';
    const slug = sanitizeString(slugSource).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 200);
    data.slug = slug;

    let post;
    if (body._id) {
        post = await BlogPost.findByIdAndUpdate(body._id, { ...data }, { new: true, upsert: true });
    } else if (body.slug) {
        // update by slug
        post = await BlogPost.findOneAndUpdate({ slug: body.slug }, { ...data }, { new: true, upsert: true });
    } else {
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

    return NextResponse.json({ ok: true, post });
}

export async function GET(req) {
    const url = new URL(req.url);
    const slug = url.searchParams.get('slug');

    await connectToDatabase();

    if (slug) {
        const post = await BlogPost.findOne({ slug }).lean();
        if (!post) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
        return NextResponse.json({ ok: true, post });
    }

    // list with basic fields
    const posts = await BlogPost.find({}).sort({ createdAt: -1 }).limit(200).lean();
    return NextResponse.json({ ok: true, posts });
}

export async function DELETE(req) {
    const { userId } = await authenticate(req);
    const isAdmin = await checkAdminPrivileges(userId);
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    if (!body.slug && !body._id) return NextResponse.json({ ok: false, error: 'missing identifier' }, { status: 400 });
    await connectToDatabase();
    if (body._id) await BlogPost.findByIdAndDelete(body._id);
    else await BlogPost.findOneAndDelete({ slug: body.slug });
    return NextResponse.json({ ok: true });
}