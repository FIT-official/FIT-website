import { describe, it, expect } from 'vitest'
import { strongGuestNameMatch, guestJoinCandidates } from '@/lib/workshopGuestJoin'
import { guestName, newGuest } from '@/lib/workshopGuestIdentity'
import { blankCanvas, validCanvas, shapeObject, strokeObject, translateObject, resizeObject } from '@/lib/workshopCanvasModel'
import { CanvasObjects } from '@/components/Workshop/CanvasDrawing'
import { render, cleanup } from '@testing-library/react'
import { createElement } from 'react'

describe('strong name candidates stay within a selected group', () => {
    it.each([['  ALEX\t\n TAN\u00a0', 'Alex Tan'], ['Alex', 'Alex Tan'], ['Alex Tan', 'Alex'], ["Anne-Marie", "Anne-Marie O'Neil"], ['小明', '李小明']])('recognises authored whole-name variants %j / %j', (a, b) => expect(strongGuestNameMatch(a, b)).toBe(true))
    it.each([['a', 'Alex Tan'], ['lex ta', 'Alex Tan'], ['Alex', 'Alexandra'], ['Tan Alex', 'Alex Tan'], ['Bill', 'William Lim'], ['Elodie', 'Élodie'], ['Li', '李小明']])('does not guess weak fragments, reordering or nicknames %j / %j', (a, b) => expect(strongGuestNameMatch(a, b)).toBe(false))
    it('normalises surplus whitespace without stripping accents, punctuation or changing stored work', async () => {
        expect(guestName('\n  Alex\t \u2003Tan\r\n')).toBe('Alex Tan')
        const rows = ['Alex Tan', 'Alex Lee'].map(name => newGuest('g2', name).record), other = newGuest('g3', 'Alex Tan').record, before = structuredClone(rows)
        const store = { find: query => ({ limit: () => ({ toArray: async () => { expect(query.group).toBe('g2'); return [...rows, other, { ...rows[0], _id: 'second-session-same-seat' }] } }) }) }
        expect(await guestJoinCandidates(store, 'g2', 'Alex')).toHaveLength(2)
        expect((await guestJoinCandidates(store, 'g2', 'Alex Tan')).map(row => row.seat)).toEqual([rows[0].seat])
        expect(rows).toEqual(before)
    })
})
describe('backward-compatible dotted drawing marks', () => {
    const settings = { colour: '#234e48', fill: 'none', size: 5, opacity: 1 }, id = 'synthetic-mark-123'
    it('preserves old solid records, accepts bounded dotted marks and rejects injected SVG styles', () => {
        const old = shapeObject('line', [100, 100], [500, 300], settings, id), dotted = shapeObject('line', [100, 100], [500, 300], { ...settings, lineStyle: 'dotted' }, id)
        expect(old).not.toHaveProperty('lineStyle'); expect(validCanvas({ ...blankCanvas(), objects: [old] })).toBe(true); expect(validCanvas({ ...blankCanvas(), objects: [dotted] })).toBe(true)
        for (const value of ['url(https://evil.test)', [], {}, 3, 'dashed']) expect(validCanvas({ ...blankCanvas(), objects: [{ ...dotted, lineStyle: value }] })).toBe(false)
        const stroke = strokeObject([[10, 10], [40, 60]], { ...settings, lineStyle: 'dotted' }, id); expect(translateObject(resizeObject(stroke, 10, 10), 10, 10).lineStyle).toBe('dotted')
    })
    it('renders safe dotted paths and lines consistently in preview and image export', () => {
        const document = { ...blankCanvas(), objects: [shapeObject('line', [10, 10], [300, 300], { ...settings, lineStyle: 'dotted' }, id)] }
        const { container } = render(createElement('svg', null, createElement(CanvasObjects, { document }))); expect(container.querySelector('[data-object-id]').getAttribute('stroke-dasharray')).toBe('1 12.5'); cleanup()
    })
})
