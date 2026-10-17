import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { createHash } from 'crypto'
import { CUSTOMER_TERMS_HTML, CUSTOMER_TERMS_SOURCE_SHA256, CUSTOMER_TERMS_VERSION } from '@/content/legal/customerTermsV1'

describe('customer terms v1.0 (/terms)', () => {
  it('carries the vetted version header and all 18 clauses', () => {
    expect(CUSTOMER_TERMS_VERSION).toBe('Version 1.0, 18 October 2026')
    expect(CUSTOMER_TERMS_HTML).toContain('<p><strong>Version 1.0, 18 October 2026</strong></p>')
    expect(CUSTOMER_TERMS_HTML.match(/<h2>/g)).toHaveLength(18)
    expect(CUSTOMER_TERMS_HTML).toContain('<h2>18. Governing law and disputes</h2>')
    expect(CUSTOMER_TERMS_HTML).toContain('Fix It Today Pte. Ltd., UEN 53370270D')
    expect(CUSTOMER_TERMS_HTML).not.toContain('(UEN 53370270D)')
  })
  it('has no old non-refundable, GST, placeholder or comment text', () => {
    expect(CUSTOMER_TERMS_HTML).not.toMatch(/non-refundable|\bGST\b|sole\s+propriet|TBC|TODO|lorem|<!--|<script/i)
    const page = readFileSync('app/terms/TermsPage.jsx', 'utf8')
    expect(page).not.toMatch(/non-refundable|\bGST\b/i)
    expect(readFileSync('app/terms/page.jsx', 'utf8')).not.toMatch(/robots|noindex/)
  })
  it('keeps the module sha pinned to its header', () => {
    expect(CUSTOMER_TERMS_SOURCE_SHA256).toMatch(/^[0-9a-f]{64}$/)
    expect(readFileSync('content/legal/customerTermsV1.js', 'utf8')).toContain(`Source sha256 ${CUSTOMER_TERMS_SOURCE_SHA256}`)
  })
})

describe('privacy entity line', () => {
  it('names the formal entity with UEN', () => {
    expect(readFileSync('app/privacy/PrivacyPage.jsx', 'utf8')).toContain('<b>Fix It Today Pte. Ltd., UEN 53370270D</b>')
  })
})
