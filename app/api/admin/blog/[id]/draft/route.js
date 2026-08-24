import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import BlogDraft from '@/models/BlogDraft';
import { authenticate, UnauthorizedError } from '@/lib/authenticate';
import { checkAdminPrivileges } from '@/lib/checkPrivileges';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin(req) {
    let userId;
    try {
        ({ userId } = await authenticate(req));
    } catch (e) {
        if (e instanceof UnauthorizedError) return null;
        throw e;
    }
    if (!(await checkAdminPrivileges(userId))) return null;
    return userId;
}

// Editor autosave snapshots (one per post+user).
export async function GET(req, { params }) {
    const userId = await requireAdmin(req);
    if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    await connectToDatabase();
    const draft = await BlogDraft.findOne({ postId: id, userId }).lean();
    return NextResponse.json({ ok: true, draft });
}

export async function PUT(req, { params }) {
    const userId = await requireAdmin(req);
    if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    await connectToDatabase();
    const draft = await BlogDraft.findOneAndUpdate(
        { postId: id, userId },
        { form: body.form || {} },
        { new: true, upsert: true },
    );
    return NextResponse.json({ ok: true, savedAt: draft.updatedAt });
}

export async function DELETE(req, { params }) {
    const userId = await requireAdmin(req);
    if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    await connectToDatabase();
    await BlogDraft.deleteOne({ postId: id, userId });
    return NextResponse.json({ ok: true });
}
