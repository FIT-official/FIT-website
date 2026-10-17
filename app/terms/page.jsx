import TermsPage from './TermsPage'
import { buildPageMetadata } from '@/lib/seo/metadata'

export const metadata = buildPageMetadata({
    title: 'Customer Terms and Conditions | Fix It Today',
    description: 'Fix It Today Customer Terms and Conditions, Version 1.0, 18 October 2026.',
    path: '/terms',
})

export default function Page() {
    return <TermsPage />
}