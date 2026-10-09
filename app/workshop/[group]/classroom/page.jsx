import { notFound } from 'next/navigation'
import { workshopGroupPage } from '@/lib/workshopPages'
import Classroom from '@/components/Workshop/GuestClassroom'
export async function generateMetadata({ params }) {
    const { group: id } = await params, group = workshopGroupPage(id)
    if (!group) notFound()
    return { title: 'Group ' + group.number + ' classroom | Fix It Today', robots: { index: false, follow: false } }
}
export default async function GroupClassroomPage({ params }) {
    const { group: id } = await params
    if (!workshopGroupPage(id)) notFound()
    // This public shell contains no student data. The guest API validates the
    // opaque session and its own group; a group URL cannot reveal private records.
    return <Classroom homeGroup={id} />
}
