import { notFound } from 'next/navigation'
import { workshopGroupPage } from '@/lib/workshopPages'
import Classroom from '@/components/Workshop/Classroom'
export async function generateMetadata({ params }) {
    const { group: id } = await params, group = workshopGroupPage(id)
    return { title: group ? 'Group ' + group.number + ' classroom | Fix It Today' : 'Group not found', robots: { index: false, follow: false } }
}
export default async function GroupClassroomPage({ params }) {
    const { group: id } = await params
    if (!workshopGroupPage(id)) notFound()
    // This shell has no student data. The existing /api/workshop cookie stays
    // restricted to its API path; authorised membership is resolved there.
    return <Classroom homeGroup={id} />
}
