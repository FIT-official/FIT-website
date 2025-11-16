import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import BlogPost from '@/models/BlogPost';

export async function GET(req, { params }) {
    const { slug } = params;
    await connectToDatabase();
    const post = await BlogPost.findOne({ slug }).lean();
    if (!post) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true, post });
}
