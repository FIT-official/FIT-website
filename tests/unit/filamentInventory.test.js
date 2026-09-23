import { describe, expect, it } from 'vitest'
import { parseFilamentInventory, rushAvailability } from '@/lib/filamentInventory'

describe('FIT filament inventory', () => {
  it('combines spool and refill stock by manufacturer colour code', () => {
    const colours = parseFilamentInventory([
      ['Bambu Lab PLA Basic', 'PLA Basic', 'BambuLab', 'Black (10101) (With Spool)', 0],
      ['Bambu Lab PLA Basic', 'PLA Basic', 'BambuLab', 'Black (10101) (Without Spool)', 23],
      ['Bambu Lab PLA Matte', 'PLA Matte', 'BambuLab', 'Charcoal (11101)', 0],
      ['ASA Gray 45102', 'ASA', 'BambuLab', '-', 25],
      ['Unrelated Black 10101', 'PLA Basic', 'Other Brand', 'Black', 99],
    ])
    expect(rushAvailability(colours, 'pla', 'Black')).toBe('in_stock')
    expect(rushAvailability(colours, 'pla_matte', 'Charcoal')).toBe('out_of_stock')
    expect(rushAvailability(colours, 'asa', 'Gray')).toBe('in_stock')
    expect(rushAvailability(colours, 'tpu', 'Black')).toBe('out_of_stock')
  })
})
