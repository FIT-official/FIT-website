import { describe, it, expect } from 'vitest'
import { effectiveStatus, statusWrite, statusQuery } from '@/lib/blog/status'

describe('effectiveStatus', () => {
  it('uses status when present', () => {
    expect(effectiveStatus({ status: 'hidden', published: true })).toBe('hidden')
  })
  it('derives from legacy published boolean', () => {
    expect(effectiveStatus({ published: true })).toBe('published')
    expect(effectiveStatus({ published: false })).toBe('draft')
    expect(effectiveStatus(null)).toBe('draft')
  })
})

describe('statusWrite', () => {
  const now = new Date('2026-07-03T00:00:00Z')
  it('publishing stamps publishDate once', () => {
    const first = statusWrite('published', null, now)
    expect(first).toEqual({ status: 'published', published: true, publishDate: now })
    const earlier = new Date('2026-01-01')
    const again = statusWrite('published', earlier, now)
    expect(again.publishDate).toBe(earlier)
  })
  it('unpublishing keeps the original publishDate and clears published', () => {
    const earlier = new Date('2026-01-01')
    expect(statusWrite('hidden', earlier, now)).toEqual({ status: 'hidden', published: false, publishDate: earlier })
    expect(statusWrite('draft', null, now).publishDate).toBeNull()
  })
  it('unlisted stamps the date once and keeps published false', () => {
    expect(statusWrite('unlisted', null, now)).toEqual({ status: 'unlisted', published: false, publishDate: now })
    const earlier = new Date('2026-01-01')
    expect(statusWrite('unlisted', earlier, now).publishDate).toBe(earlier)
  })
  it('rejects unknown statuses as draft', () => {
    expect(statusWrite('nonsense', null, now).status).toBe('draft')
  })
})

describe('statusQuery', () => {
  it('unlisted matches only explicit status', () => {
    expect(statusQuery('unlisted')).toEqual({ status: 'unlisted' })
    expect(effectiveStatus({ status: 'unlisted', published: true })).toBe('unlisted')
  })
  it('published matches status OR the legacy published boolean', () => {
    expect(statusQuery('published')).toEqual({
      $or: [{ status: 'published' }, { status: null, published: true }],
    })
  })
  it('draft matches status OR legacy unpublished docs', () => {
    expect(statusQuery('draft')).toEqual({
      $or: [{ status: 'draft' }, { status: null, published: { $ne: true } }],
    })
  })
  it('hidden matches only the explicit status', () => {
    expect(statusQuery('hidden')).toEqual({ status: 'hidden' })
  })
  it('anything else (all / missing) matches everything', () => {
    expect(statusQuery('all')).toEqual({})
    expect(statusQuery(null)).toEqual({})
    expect(statusQuery(undefined)).toEqual({})
  })
})
