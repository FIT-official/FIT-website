import styles from '../terms/TermsPage.module.css'
import { buildPageMetadata } from '@/lib/seo/metadata'
import { CREATOR_TERMS_HTML } from '@/content/legal/creatorTermsV1'

export const metadata = buildPageMetadata({
    title: 'Creator Terms of Agreement | Fix It Today',
    description: 'Fix It Today Creator Terms of Agreement, Version 1.0, 18 October 2026.',
    path: '/creator-terms',
})

// Creator Terms v1.0 rendered verbatim from the vetted FIT Business file (static, trusted content).
export default function Page() {
    return (
        <div className="border-b border-borderColor py-6">
            <article className={styles.legal} data-legal-doc="creator-terms" dangerouslySetInnerHTML={{ __html: CREATOR_TERMS_HTML }} />
        </div>
    )
}
