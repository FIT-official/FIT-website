import { describe, it, expect } from 'vitest'
import {
  emailLayout,
  ctaButton,
  breakdownTable,
  infoTable,
  esc,
  money,
} from '@/lib/email/template'

describe('email base template', () => {
  it('escapes HTML-significant characters', () => {
    expect(esc('<script>&"')).toBe('&lt;script&gt;&amp;&quot;')
    expect(esc(null)).toBe('')
  })

  it('formats money in major units, 2dp, upper-cased currency', () => {
    expect(money(12.5, 'sgd')).toBe('SGD 12.50')
    expect(money('nope', 'usd')).toBe('Not recorded')
  })

  it('emailLayout embeds the body and hidden preheader', () => {
    const html = emailLayout({ title: 'T', preheader: 'peek', bodyHtml: '<p>hi</p>' })
    expect(html).toContain('<p>hi</p>')
    expect(html).toContain('peek')
    expect(html).toContain('<!DOCTYPE html>')
  })

  it('ctaButton renders an escaped href + label, empty when no href', () => {
    const btn = ctaButton({ href: 'https://x.test/cart?a=1&b=2', label: 'Pay' })
    expect(btn).toContain('https://x.test/cart?a=1&amp;b=2')
    expect(btn).toContain('Pay')
    expect(ctaButton({ href: '' })).toBe('')
  })

  it('breakdownTable lists positive lines + total', () => {
    const html = breakdownTable({
      lines: [
        { label: 'Material', amount: 5 },
        { label: 'Zero line', amount: 0 },
        { label: 'Base', amount: 0, always: true },
      ],
      total: 5,
      currency: 'sgd',
    })
    expect(html).toContain('Material')
    expect(html).toContain('SGD 5.00')
    expect(html).toContain('Base') // always-shown even at 0
    expect(html).not.toContain('Zero line') // 0 + not always → hidden
    expect(html).toContain('Total')
  })

  it('infoTable drops empty values and escapes', () => {
    const html = infoTable([['ID', 'r1'], ['Empty', ''], ['Bad', '<x>']])
    expect(html).toContain('r1')
    expect(html).not.toContain('Empty')
    expect(html).toContain('&lt;x&gt;')
  })
})
