import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
vi.mock('next/image', () => ({ default: ({ alt }) => <span role="img" aria-label={alt || ''} /> }))
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }))
import Hub from '@/app/workshop/page'
import ReviewedGroupPage from '@/components/Workshop/ReviewedGroupPage'
import { workshopGroups, workshopGroupPage } from '@/lib/workshopPages'
import { workshopPost, workshopArticleHtml } from '@/lib/blog/designThinkingWorkshop'
import slides from '@/content/workshop-lesson-slides.json'
describe('workshop instructions without lesson duration badges', () => {
    it('keeps entry and all groups while removing the landing duration', () => { render(<Hub />); expect(screen.getByRole('link', { name: 'Enter class' })).toHaveAttribute('href', '/workshop/entry'); expect(document.body.textContent).not.toMatch(/\b\d+\s*(?:minutes|mins|min read)|countdown/i) })
    it('omits time allocations across all group pages', () => { for (const item of workshopGroups) { const view = render(<ReviewedGroupPage group={workshopGroupPage(item.id)} />); expect(view.container.textContent).not.toMatch(/Activity \d+\s*·\s*\d+|\b(?:30|10) minutes/); view.unmount() } })
    it('removes blog duration and reading-time badges while preserving the activity content', () => { expect(workshopPost.readingTimeMinutes).toBeNull(); expect(workshopPost.excerpt).not.toMatch(/30.minute/); const html = workshopArticleHtml(); expect(html).not.toMatch(/30.minute|10 minutes/); expect(html).toContain('Your activities') })
    it('keeps projected slides free of lesson duration and countdown text', () => { const text = slides.slides.flatMap(slide => slide.blocks.map(block => block.text)).join('\n'); expect(text).not.toMatch(/\b\d+[ -]*(?:minutes|mins)|countdown/i) })
})
