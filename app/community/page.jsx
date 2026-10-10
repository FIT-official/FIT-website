import CommunityBoard from '@/components/Community/CommunityBoard'
import { buildPageMetadata } from '@/lib/seo/metadata'
export const metadata = buildPageMetadata({ title: 'Maker Community | FIT', description: 'Ask maker questions, share projects and join thoughtful discussions. Every contribution is reviewed before publication.', path: '/community' })
export default function CommunityPage() { return <main><CommunityBoard /></main> }
