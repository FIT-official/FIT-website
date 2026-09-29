import TermsPage from './TermsPage'
import { buildPageMetadata } from '@/lib/seo/metadata'

export const metadata = buildPageMetadata({
    title: 'Terms of Service | Fix It Today',
    description: 'Terms of service for purchases, custom work and use of the Fix It Today website.',
    path: '/terms',
})

export default function Page() {
    return <TermsPage />
}