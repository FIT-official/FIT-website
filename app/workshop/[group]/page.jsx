import { notFound } from 'next/navigation'
import { workshopGroupPage, assertWorkshopImagesReady } from '@/lib/workshopPages'
import ReviewedGroupPage from '@/components/Workshop/ReviewedGroupPage'
export async function generateMetadata({ params }) {
    if (!workshopGroupPage((await params).group)) notFound()
    return { title: 'Design-thinking group activities | Fix It Today', robots: { index: false, follow: false } }
}
export default async function GroupPage({ params }) {
    const { group: id } = await params
    const group = workshopGroupPage(id)
    if (!group) notFound()
    assertWorkshopImagesReady()
    return <ReviewedGroupPage group={group} />
}
