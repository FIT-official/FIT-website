import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import NewsletterCampaign from '@/models/NewsletterCampaign'
import { authenticate, unauthorizedResponse } from '@/lib/authenticate'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req, { params }) {
    let userId
    try {
        ({ userId } = await authenticate(req))
    } catch {
        return unauthorizedResponse()
    }
    if (!(await checkAdminPrivileges(userId))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { id } = await params
    await connectToDatabase()
    const source = await NewsletterCampaign.findById(id).lean()
    if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const campaign = await NewsletterCampaign.create({
        subject: `Copy of ${source.subject}`,
        intro: source.intro,
        articleIds: source.articleIds,
        audience: source.audience,
        status: 'draft',
    })
    return NextResponse.json({ ok: true, campaign })
}
