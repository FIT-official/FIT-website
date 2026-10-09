import { describe, expect, it } from 'vitest'
import { repairFixture } from '../fixtures/printerRepair'
import { REPAIR_GUIDANCE, REPAIR_MODELS, reconcileRepairSelection, repairIssueOptions, repairSpecificOptions } from '@/lib/printerRepair/options'
import { validateRepairSubmission } from '@/lib/printerRepair/validate'
const keys = brief => repairIssueOptions(brief).map(([key]) => key)
const checked = patch => validateRepairSubmission({ ...repairFixture, brief: { ...repairFixture.brief, ...patch } })
describe('brand-aware repair intake', () => {
  it('accepts an optional observation only within its selected symptom category', () => {
    expect(checked({ specificSymptom: 'stops' }).value.brief.specificSymptom).toBe('stops')
    expect(checked({ specificSymptom: '' }).ok).toBe(true)
    for (const specificSymptom of ['homing', 'constructor', '__proto__', {}, 123]) expect(checked({ specificSymptom }).ok).toBe(false)
    expect(repairSpecificOptions('constructor')).toEqual([])
  })
  it('clears a dependent observation when the category changes and preserves the copied brief', () => {
    const brief = { ...repairFixture.brief, specificSymptom: 'stops', errorCode: '#04106' }
    const changed = reconcileRepairSelection(brief, 'issue', 'movement')
    expect(changed.brief).toMatchObject({ issue: 'movement', specificSymptom: '', details: brief.details, errorCode: '#04106' })
  })
  it('normalises a selected brand/model without trusting supplied display text', () => {
    const result = checked({ brand: 'Wrong label', model: 'Wrong model' })
    expect(result.value.brief).toMatchObject({ brand: 'Bambu Lab', brandChoice: 'bambu_lab', model: 'A1', modelChoice: 'a1', brandOther: '' })
  })
  it('preserves the original Other brand separately from its trimmed value', () => {
    const result = checked({ brandChoice: 'other', brand: '  Custom Printer  ', brandOther: '  Custom Printer  ', modelChoice: 'other', model: ' Custom model ' })
    expect(result.ok).toBe(true)
    expect(result.value.brief).toMatchObject({ brand: 'Custom Printer', brandOther: '  Custom Printer  ', model: 'Custom model' })
    expect(checked({ brandChoice: 'other', brandOther: '   ', modelChoice: 'other' }).ok).toBe(false)
  })
  it('allows Not sure and flexible models without promising brand support', () => {
    expect(checked({ brandChoice: 'not_sure', modelChoice: 'other', model: 'Unsure' }).ok).toBe(true)
    expect(checked({ modelChoice: 'other', model: 'Modified A1' }).value.brief.model).toBe('Modified A1')
    expect(checked({ modelChoice: 'not_sure', model: '' }).value.brief.model).toBe('Not sure')
  })
  it.each(['constructor', '__proto__', 'toString', 'unlisted'])('rejects unknown brand keys safely: %s', brandChoice => expect(checked({ brandChoice }).ok).toBe(false))
  it('rejects mismatched model/feeder/issue choices on the server', () => {
    for (const patch of [{ modelChoice: 'mk4s' }, { feeder: 'mmu' }, { issue: 'mmu' }, { issue: 'ams', feeder: 'none' }, { issue: 'hotend_switch', modelChoice: 'a1' }]) expect(checked(patch).ok).toBe(false)
    expect(checked({ brandChoice: 'prusa', modelChoice: 'mk4s', feeder: 'none', issue: 'tool_change' }).ok).toBe(false)
  })
  it('shows installed AMS only for Bambu and installed MMU only for Prusa', () => {
    for (const feeder of ['ams', 'ams_lite', 'ams_2_pro', 'ams_ht']) expect(keys({ brandChoice: 'bambu_lab', modelChoice: 'a1', feeder })).toContain('ams')
    for (const feeder of ['none', 'other', 'not_sure']) expect(keys({ brandChoice: 'bambu_lab', modelChoice: 'a1', feeder })).not.toContain('ams')
    expect(keys({ brandChoice: 'prusa', modelChoice: 'mk4s', feeder: 'mmu' })).toContain('mmu')
    expect(keys({ brandChoice: 'prusa', modelChoice: 'mk4s', feeder: 'none' })).not.toContain('mmu')
    expect(keys({ brandChoice: 'prusa', feeder: 'ams' })).not.toContain('ams')
    expect(keys({ brandChoice: 'bambu_lab', feeder: 'mmu' })).not.toContain('mmu')
  })
  it('restricts H2C rack symptoms and XL tool symptoms to their model families', () => {
    expect(keys({ brandChoice: 'bambu_lab', modelChoice: 'h2c' })).toContain('hotend_switch')
    expect(keys({ brandChoice: 'bambu_lab', modelChoice: 'h2d' })).not.toContain('hotend_switch')
    for (const modelChoice of ['xl', 'xl_plus']) expect(keys({ brandChoice: 'prusa', modelChoice })).toContain('tool_change')
    expect(keys({ brandChoice: 'prusa', modelChoice: 'mk4s' })).not.toContain('tool_change')
  })
  it('clears an inapplicable choice while keeping description, raw error and custom brand text', () => {
    const brief = { ...repairFixture.brief, modelChoice: 'h2c', model: 'H2C', issue: 'hotend_switch', errorCode: '#04106', brandOther: 'My printer' }
    const model = reconcileRepairSelection(brief, 'modelChoice', 'a1')
    expect(model.brief).toMatchObject({ model: 'A1', issue: '', details: brief.details, errorCode: '#04106', brandOther: 'My printer' })
    expect(model.notice).toContain('photos are kept')
    const brand = reconcileRepairSelection({ ...brief, feeder: 'ams', issue: 'ams' }, 'brandChoice', 'prusa')
    expect(brand.brief).toMatchObject({ issue: '', feeder: 'not_sure', modelChoice: '', model: '', errorCode: '#04106' })
  })
  it('accepts unknown and leading-zero error strings without interpreting them', () => {
    for (const errorCode of ['#04106', 'HMS_0300-9999-0001-0001', 'New firmware says: printer paused']) expect(checked({ errorCode }).value.brief.errorCode).toBe(errorCode)
  })
  it('retains older X1 models and versioned official references', () => {
    expect(REPAIR_MODELS.bambu_lab.map(([key]) => key)).toEqual(expect.arrayContaining(['x1', 'x1_carbon', 'x1e']))
    for (const guide of Object.values(REPAIR_GUIDANCE)) expect(guide.lastVerified).toBe('2026-09-30')
  })
})
