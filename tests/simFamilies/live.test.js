import { describe, expect, it } from 'vitest'
import { LIVE_FAMILY } from '../../public/simulations/families/live.js'
import { familyVariants } from '../../public/simulations/families/catalog.js'
import { getLiveSims } from '../../lib/sims/registry'
import { playerDocument } from '../../lib/classroomSimulations/playerDocument'

describe('concept-family live gating', () => {
  it('only allowlisted variants are live; the rest are drafts that 404', () => {
    const live = new Set(getLiveSims().map(s => s.id))
    for (const v of familyVariants) {
      expect(live.has(v.id)).toBe(LIVE_FAMILY.includes(v.id))
      if (LIVE_FAMILY.includes(v.id)) expect(playerDocument(v.id)).toContain('/simulations/families/main.js')
      else expect(playerDocument(v.id)).toBeNull()
    }
    for (const id of LIVE_FAMILY) expect(familyVariants.some(v => v.id === id)).toBe(true)
  })
  it('university variants carry generic labels, never NUS/NTU module codes', () => {
    for (const v of familyVariants.filter(v => v.levelCode === 'U')) {
      expect(v.syllabus).toMatch(/^University, /)
      expect(JSON.stringify(v)).not.toMatch(/\b[A-Z]{2,3}\d{4}[A-Z]?\b/)
    }
  })
})

describe('embedded family player sizing', () => {
  it('shell.css never sizes the document from the viewport (host iframe auto-height would grow forever)', async () => {
    const css = (await import('fs')).readFileSync('public/simulations/families/shell.css', 'utf8')
    expect(css).not.toMatch(/\d+(\.\d+)?(d|s|l)?vh/)
  })
})
