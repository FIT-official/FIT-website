import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import BlogPost from '@/models/BlogPost';
import { authenticate, unauthorizedResponse } from '@/lib/authenticate';
import { checkAdminPrivileges } from '@/lib/checkPrivileges';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST { slug, excludeId? } → { exists } — live uniqueness check for the editor.
export async function POST(req) {
    let userId;
    try {
        ({ userId } = await authenticate(req));
    } catch {
        return unauthorizedResponse();
    }
    if (!(await checkAdminPrivileges(userId))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const slug = String(body.slug || '').trim();
    if (!slug) return NextResponse.json({ exists: false });
    await connectToDatabase();
    const query = { slug };
    if (body.excludeId) query._id = { $ne: body.excludeId };
    const exists = Boolean(await BlogPost.exists(query));
    return NextResponse.json({ exists });
}
