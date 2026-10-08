import { redirect, notFound } from 'next/navigation'
import { requireGuestTeacher } from '@/lib/workshopGuestAccess'
import { UnauthorizedError } from '@/lib/authenticate'
import { workshopGroups, workshopGroupPage, assertWorkshopImagesReady } from '@/lib/workshopPages'
import GroupProjectReader from '@/components/Workshop/GroupProjectReader'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Class group projects | Fix It Today', robots: { index: false, follow: false } }

export default async function Page() {
    try { await requireGuestTeacher() }
    catch (error) {
        if (error instanceof UnauthorizedError || error.status === 401) redirect('/sign-in?redirect_url=%2Fadmin%2Fworkshop%2Fprojects')
        if (error.status === 403) notFound()
        throw error
    }
    assertWorkshopImagesReady()
    const groups = workshopGroups.map(({ id }) => {
        const group = workshopGroupPage(id)
        return { id, number: group.number, ideas: group.ideas.map((idea, index) => {
            const { src, alt, width, height, caption } = group.models[index]
            return { title: idea.title, copy: idea.pupilCopy, image: { src, alt, width, height, caption } }
        }) }
    })
    return <GroupProjectReader groups={groups} />
}
