import { notFound } from 'next/navigation'
import { workshopGroupPage } from '@/lib/workshopPages'
import ReviewedGroupPage from '@/components/Workshop/ReviewedGroupPage'
export const metadata = { title: 'Design-thinking group activities | Fix It Today', robots: { index: false, follow: false } }
export default async function GroupPage({ params }) {
    const { group: id } = await params
    const group = workshopGroupPage(id)
    if (!group) notFound()
    return <ReviewedGroupPage group={group} />
}
