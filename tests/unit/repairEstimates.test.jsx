import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { cleanup, render } from '@testing-library/react'
import RepairEstimates from '@/components/Services/RepairEstimates'
import { REPAIR_ESTIMATES } from '@/lib/printerRepair/validate'

afterEach(cleanup)
const COPY = ['Drop-off est. S$50–150', 'On-site est. S$150–270 minimum', 'Final price per quote.', 'Diagnosis takes about 2 weeks.', 'In the event the printer is not serviceable, no charges will be incurred.']

describe('repair estimates (display only)', () => {
  it('renders the exact copy under an "Estimate" label', () => {
    const { container, getByText } = render(<RepairEstimates />)
    expect(getByText('Estimate')).toBeTruthy()
    for (const line of COPY) expect(container.textContent).toContain(line)
    expect(container.querySelector('[data-repair-estimates]').className).toMatch(/text-lightColor/)
  })
  it('keeps the copy in one place', () => expect([REPAIR_ESTIMATES.drop_off, REPAIR_ESTIMATES.home_visit, REPAIR_ESTIMATES.note]).toEqual(COPY.slice(0, 3)))
  it('adds the diagnosis time and not-serviceable lines', () => expect([REPAIR_ESTIMATES.diagnosis, REPAIR_ESTIMATES.not_serviceable]).toEqual(COPY.slice(3)))
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
  it('never mentions a repair warranty and never reverts to the old "from SGD 80" price', () => {
    const { container } = render(<RepairEstimates />)
    expect(container.textContent).not.toMatch(/warrant/i)
    const { execSync } = require('child_process')
    const files = execSync('git -c safe.directory=* ls-files -- app components lib content emails data public', { encoding: 'utf8' }).split(/\r?\n/).filter(f => /\.(js|jsx|ts|tsx|json|md|mdx|html|txt)$/.test(f))
    const hits = files.filter(f => /from\s+(SGD|S\$)\s?80\b/i.test(readFileSync(f, 'utf8')))
    expect(hits).toEqual([])
  })
})
