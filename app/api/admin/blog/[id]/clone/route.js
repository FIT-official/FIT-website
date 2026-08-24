import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import BlogPost from '@/models/BlogPost';
import { authenticate, unauthorizedResponse } from '@/lib/authenticate';
import { checkAdminPrivileges } from '@/lib/checkPrivileges';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — duplicate a post as a new draft with a unique slug.
export async function POST(req, { params }) {
    let userId;
    try {
        ({ userId } = await authenticate(req));
    } catch {
        return unauthorizedResponse();
    }
    if (!(await checkAdminPrivileges(userId))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;
    await connectToDatabase();
    const source = await BlogPost.findById(id).lean();
    if (!source) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

    const { _id, createdAt, updatedAt, ...rest } = source;
    let slug = `${source.slug}-copy`;
    let counter = 0;
    while (await BlogPost.exists({ slug })) {
        counter += 1;
        slug = `${source.slug}-copy-${counter}`;
    }
    const post = await BlogPost.create({
        ...rest,
        title: `Copy of ${source.title}`,
        slug,
        status: 'draft',
        published: false,
        publishDate: null,
        scheduledFor: null,
        featured: false,
        authorId: userId,
    });
    return NextResponse.json({ ok: true, post });
}
