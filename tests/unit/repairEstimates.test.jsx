import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { cleanup, render } from '@testing-library/react'
import RepairEstimates from '@/components/Services/RepairEstimates'
import { REPAIR_ESTIMATES } from '@/lib/printerRepair/validate'

afterEach(cleanup)
const COPY = ['Drop-off repair (bring your printer in): est. $50–$150', 'On-site / home visit repair: est. $150–$270 minimum, depending on printer model and issue', 'Final price depends on your quote.']

describe('repair estimates (display only)', () => {
  it('renders the exact copy under an "Estimate" label', () => {
    const { container, getByText } = render(<RepairEstimates />)
    expect(getByText('Estimate')).toBeTruthy()
    for (const line of COPY) expect(container.textContent).toContain(line)
    expect(container.querySelector('[data-repair-estimates]').className).toMatch(/text-lightColor/)
  })
  it('keeps the copy in one place', () => expect([REPAIR_ESTIMATES.drop_off, REPAIR_ESTIMATES.home_visit, REPAIR_ESTIMATES.note]).toEqual(COPY))
  it('appears on the repair page and next to the drop-off / home-visit choice in the form', () => {
    expect(readFileSync('app/printer-repair/page.jsx', 'utf8')).toContain('<RepairEstimates')
    const flow = readFileSync('components/Services/PrinterRepairFlow.jsx', 'utf8')
    expect(flow.indexOf('<RepairEstimates />')).toBeGreaterThan(-1)
    expect(Math.abs(flow.indexOf("field('handover'") - flow.indexOf('<RepairEstimates />'))).toBeLessThan(200)
  })
  it('does not touch prices: no SKU, Stripe or tier reference', () => {
    const src = readFileSync('components/Services/RepairEstimates.jsx', 'utf8').replace(/\/\/.*$/gm, '')
    expect(src).not.toMatch(/stripe|price_|sku|tier/i)
  })
})