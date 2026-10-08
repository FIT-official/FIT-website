import { redirect, notFound } from 'next/navigation'
import { requireGuestTeacher } from '@/lib/workshopGuestAccess'
import { UnauthorizedError } from '@/lib/authenticate'
import LessonProjection from '@/components/Workshop/LessonProjection'
import slides from '@/content/workshop-lesson-slides.json'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'FIT lesson instructions', robots: { index: false, follow: false } }

export default async function Page() {
    try { await requireGuestTeacher() }
    catch (error) {
        if (error instanceof UnauthorizedError || error.status === 401) redirect('/sign-in?redirect_url=%2Fadmin%2Fworkshop%2Finstructions')
        if (error.status === 403) notFound()
        throw error
    }
    return <LessonProjection deck={slides} />
}
