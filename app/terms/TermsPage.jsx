import React from 'react'
import styles from './TermsPage.module.css'
import { CUSTOMER_TERMS_HTML } from '@/content/legal/customerTermsV1'

// Customer Terms v1.0 rendered verbatim from the vetted FIT Business file (static, trusted content).
function TermsPage() {
    return (
        <div className="border-b border-borderColor py-6">
            <article className={styles.legal} data-legal-doc="customer-terms" dangerouslySetInnerHTML={{ __html: CUSTOMER_TERMS_HTML }} />
        </div>
    )
}

export default TermsPage
