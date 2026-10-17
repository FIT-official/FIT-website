import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { execSync } from 'child_process'

const FORMAL = 'Fix It Today Pte. Ltd., UEN 53370270D'

describe('entity name', () => {
  it('shows the formal entity and UEN on the footer legal line', () => {
    const footer = readFileSync('components/General/Footer.jsx', 'utf8')
    expect(footer).toContain(`{new Date().getFullYear()} ${FORMAL}. All rights reserved.`)
  })
  it('never describes FIT as a sole proprietorship', () => {
    const files = execSync('git -c safe.directory=* ls-files -- app components lib content', { encoding: 'utf8' }).split(/\r?\n/).filter(f => /\.(js|jsx|ts|tsx|json|md|mdx|html)$/.test(f))
    expect(files.filter(f => /sole\s+propriet/i.test(readFileSync(f, 'utf8')))).toEqual([])
  })
})