import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { CREATOR_TERMS_HTML, CREATOR_TERMS_SOURCE_SHA256, CREATOR_TERMS_VERSION } from '@/content/legal/creatorTermsV1'

describe('creator terms v1.0 (/creator-terms)', () => {
  it('carries the vetted version header and all 24 clauses', () => {
    expect(CREATOR_TERMS_VERSION).toBe('Version 1.0, 18 October 2026')
    expect(CREATOR_TERMS_HTML).toContain('<h1>Fix It Today Creator Terms of Agreement</h1>')
    expect(CREATOR_TERMS_HTML).toContain('<p><strong>Version 1.0, 18 October 2026</strong></p>')
    expect(CREATOR_TERMS_HTML.match(/<h2>/g)).toHaveLength(24)
  })
  it('has no placeholders, comments or scripts and is indexable', () => {
    expect(CREATOR_TERMS_HTML).not.toMatch(/TBC|TODO|lorem|<!--|<script|non-refundable/i)
    expect(readFileSync('app/creator-terms/page.jsx', 'utf8')).not.toMatch(/robots|noindex/)
    expect(readFileSync('lib/seo/sitemap.js', 'utf8')).toContain("'/creator-terms'")
    expect(readFileSync('content/legal/creatorTermsV1.js', 'utf8')).toContain(`Source sha256 ${CREATOR_TERMS_SOURCE_SHA256}`)
  })
  it('no longer ships the legacy terms MDX with the old non-refundable/GST text', () => {
    expect(existsSync('content/terms/content.mdx')).toBe(false)
  })
})
