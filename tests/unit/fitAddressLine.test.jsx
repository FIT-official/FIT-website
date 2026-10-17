import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { cleanup, render } from '@testing-library/react'
import FitAddressLine from '../../components/General/FitAddressLine'
import { fitAddressLineText, fitAddressLineEmailHtml, FIT_URL } from '../../lib/site/identity'
import { emailLayout } from '../../lib/email/template'
import { wrapInTemplate } from '../../lib/email'

afterEach(cleanup)
// Physical-address shapes: Singapore postal codes, unit numbers, Blk/Block, "Road/Street/Avenue". None until the PM confirms one.
const ADDRESS = /\b\d{6}\b|#\d{1,3}-\d{1,4}|\bBlk\b|\bBlock \d|\b(Road|Street|Avenue|Ave|Drive|Lane|Crescent)\b/

describe('FIT address line', () => {
  it('renders selectable text with a real link, no image', () => {
    const { container } = render(<FitAddressLine />)
    const p = container.querySelector('[data-fit-address-line]')
    expect(p.textContent).toBe('Fix It Today, www.fixitoday.com')
    expect(p.querySelector('a').getAttribute('href')).toBe('https://www.fixitoday.com')
    expect(p.querySelector('img,svg')).toBeNull()
  })
  it('takes an optional address later and ignores blanks', () => {
    expect(render(<FitAddressLine address="  " />).container.textContent).toBe('Fix It Today, www.fixitoday.com')
    cleanup()
    expect(render(<FitAddressLine address="Example Address" />).container.textContent).toBe('Fix It Today, www.fixitoday.com, Example Address')
    expect(fitAddressLineText()).toBe('Fix It Today, www.fixitoday.com')
    expect(fitAddressLineText({ address: 'X' })).toBe('Fix It Today, www.fixitoday.com, X')
    expect(fitAddressLineEmailHtml({ address: '<b>' })).toContain(', &lt;b&gt;')
  })
  it('never ships a physical address in the shared line', () => {
    for (const f of ['lib/site/identity.js', 'components/General/FitAddressLine.jsx']) expect(readFileSync(f, 'utf8')).not.toMatch(ADDRESS)
    expect(FIT_URL).toBe('https://www.fixitoday.com')
  })

  const flows = {
    'app/printer-repair/page.jsx': 'repair request',
    'app/shop/page.jsx': 'shop',
    'app/products/[slug]/page.jsx': 'product / buy',
    'app/cart/page.jsx': 'cart',
    'app/checkout/page.jsx': 'checkout',
    'app/checkout/return/page.jsx': 'checkout success / cancel return',
    'app/shop/bulk-filament/page.jsx': 'bulk filament quote',
    'app/prints/page.jsx': 'prints',
    'app/prints/request/page.jsx': 'print request form',
    'app/account/orders/[orderId]/page.jsx': 'order confirmation',
    'app/account/subscription/success/page.jsx': 'subscription success',
    'components/General/Footer.jsx': 'contact / enquiry (footer Contact Us)',
  }
  it.each(Object.entries(flows))('%s (%s) renders the shared line', file => {
    const src = readFileSync(file, 'utf8')
    expect(src).toMatch(/import FitAddressLine from '@\/components\/General\/FitAddressLine'/)
    expect(src).toMatch(/<FitAddressLine\b[^>]*\/>/)
  })

  it('customer emails carry the same line', () => {
    for (const html of [emailLayout({ bodyHtml: '<p>x</p>' }), wrapInTemplate('<p>x</p>')]) {
      expect(html).toContain('data-fit-address-line')
      expect(html.replace(/<[^>]+>/g, '')).toContain('Fix It Today, www.fixitoday.com')
      expect(html).toContain('href="https://www.fixitoday.com"')
    }
  })
})