import { notFound } from 'next/navigation'
import CommunityThread from '@/components/Community/CommunityThread'
import { PRIVATE_PAGE_ROBOTS } from '@/lib/seo/metadata'
export const metadata = { title: 'Community Discussion | FIT', robots: PRIVATE_PAGE_ROBOTS }
export default async function CommunityThreadPage({ params }) {
  const { entryId } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entryId)) notFound()
  return <main><CommunityThread entryId={entryId} /></main>
}
