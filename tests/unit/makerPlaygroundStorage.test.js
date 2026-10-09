import { beforeEach, expect, it } from 'vitest'
import { exportName, loadDraft, removeDraft, saveDraft } from '@/lib/makerPlayground/storage'
import { MAX_SOURCE } from '@/lib/makerPlayground/preview'

beforeEach(() => localStorage.clear())
it('saves and reloads exact source including HTML as inert data', () => {
  const source = '<script>alert(1)</script>\nvoid loop() {}'
  expect(saveDraft(localStorage, 'uno', 'blink', source)).toBe(true)
  expect(loadDraft(localStorage, 'uno', 'blink')).toEqual({ status: 'restored', source })
})
it('isolates each board and lesson and removes only the selected slot', () => {
  saveDraft(localStorage, 'uno', 'blink', 'one'); saveDraft(localStorage, 'esp32', 'blink', 'two'); saveDraft(localStorage, 'uno', 'button', 'three')
  localStorage.setItem('unrelated', 'keep')
  expect(removeDraft(localStorage, 'uno', 'blink')).toBe(true)
  expect(loadDraft(localStorage, 'uno', 'blink').status).toBe('empty')
  expect(loadDraft(localStorage, 'esp32', 'blink').source).toBe('two')
  expect(loadDraft(localStorage, 'uno', 'button').source).toBe('three')
  expect(localStorage.getItem('unrelated')).toBe('keep')
})
it.each(['null', '{}', '{', '{"version":2}', JSON.stringify({ version: 1, board: 'esp32', lesson: 'blink', source: 'wrong board' }), JSON.stringify({ version: 1, board: 'uno', lesson: 'blink', source: 'a'.repeat(MAX_SOURCE + 1) }), ' '.repeat(MAX_SOURCE * 6 + 257)])('does not overwrite invalid saved data', raw => {
  localStorage.setItem('fit.makerPlayground.v1.uno.blink', raw)
  expect(['invalid', 'unavailable']).toContain(loadDraft(localStorage, 'uno', 'blink').status)
  expect(localStorage.getItem('fit.makerPlayground.v1.uno.blink')).toBe(raw)
})
it('handles storage denial and quota failures', () => {
  const storage = { getItem() { throw Error('blocked') }, setItem() { throw Error('quota') }, removeItem() { throw Error('blocked') } }
  expect(loadDraft(storage, 'uno', 'blink').status).toBe('unavailable')
  expect(saveDraft(storage, 'uno', 'blink', 'draft')).toBe(false)
  expect(removeDraft(storage, 'uno', 'blink')).toBe(false)
})
it('refuses oversized sources and unknown draft paths', () => {
  expect(saveDraft(localStorage, 'uno', 'blink', 'a'.repeat(MAX_SOURCE + 1))).toBe(false)
  expect(saveDraft(localStorage, '../../foo', 'blink', 'bad')).toBe(false)
  expect(() => exportName('uno', '../x')).toThrow()
  expect(exportName('esp32', 'button')).toBe('fit_esp32_button.ino')
})
