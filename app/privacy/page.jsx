import PrivacyPage from './PrivacyPage'
import { buildPageMetadata } from '@/lib/seo/metadata'

export const metadata = buildPageMetadata({
    title: 'Privacy Policy | Fix It Today',
    description: 'How Fix It Today collects, uses and protects information shared through our website.',
    path: '/privacy',
})

export default function Page() {
    return <PrivacyPage />
}