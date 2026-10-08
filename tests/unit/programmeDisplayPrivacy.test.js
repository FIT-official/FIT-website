import { describe, it, expect } from 'vitest'
import { programmeHtmlCopy, programmePostCopy } from '@/lib/blog/programmeCopy'
import { omitRejectedPhoto } from '@/lib/blog/excludedPhoto'
import { blogMetadata } from '@/lib/seo/blog'
describe('programme display privacy with existing unlisted protection', () => {
    it('replaces names in displayed copy and alt text while preserving original photo/link URLs', () => {
        const html = `<h2>Nanyang Girls' High School</h2><p>Miniature work with Bartley Secondary School and Boon Lay Garden Primary School.</p><img src="/images/nygh-room-models.jpg" alt="NYGH room models"><a href="/images/nygh-room-models.jpg">NYGH photos</a>`
        const clean = programmeHtmlCopy(html, 'school-stem-collaborations')
        expect(clean).toContain('src="/images/nygh-room-models.jpg"'); expect(clean).toContain('href="/images/nygh-room-models.jpg"'); expect(clean).not.toContain('alt="NYGH'); expect(clean).not.toContain('Nanyang'); expect(clean).not.toContain('Bartley'); expect(clean).not.toContain('Boon Lay')
    })
    it('omits rejected whole/cropped/resized figures and leaves permitted source photographs intact', () => {
        const html = '<figure><img src="/_next/image?url=%2Fimages%2Fnygh-printed-mechanism.jpg&w=800"><figcaption>Rejected</figcaption></figure><img src="/images/nygh-printed-mechanism-crop.png"><img src="/images/nygh-room-models.jpg">'
        expect(omitRejectedPhoto(html)).toBe('<img src="/images/nygh-room-models.jpg">')
    })
    it('keeps unlisted status and noindex after programme metadata correction', () => {
        const post = { slug: 'school-stem-collaborations', title: 'School project', status: 'unlisted', metaDescription: 'Explore NYGH room models.' }
        const clean = programmePostCopy(post)
        expect(clean.status).toBe('unlisted'); expect(blogMetadata(clean).robots.index).toBe(false); expect(blogMetadata(clean).description).not.toContain('NYGH'); expect(post.metaDescription).toContain('NYGH')
    })
    it('does not rewrite unrelated articles', () => {
        const post = { slug: 'unrelated', title: 'Original' }
        expect(programmePostCopy(post)).toBe(post); expect(programmeHtmlCopy('Original HTML', post.slug)).toBe('Original HTML')
    })
})
