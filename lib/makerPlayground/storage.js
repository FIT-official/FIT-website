import { boards, lessons } from './starters'
import { MAX_SOURCE } from './preview'

function keyFor(board, lesson) {
  if (!boards.some(item => item.id === board) || !lessons.some(item => item.id === lesson)) throw new Error('Unknown draft slot')
  return `fit.makerPlayground.v1.${board}.${lesson}`
}
export function loadDraft(storage, board, lesson) {
  try {
    const raw = storage.getItem(keyFor(board, lesson))
    if (raw === null) return { status: 'empty' }
    if (raw.length > MAX_SOURCE * 6 + 256) return { status: 'invalid' }
    const draft = JSON.parse(raw)
    if (!draft || draft.version !== 1 || draft.board !== board || draft.lesson !== lesson || typeof draft.source !== 'string' || draft.source.length > MAX_SOURCE) return { status: 'invalid' }
    return { status: 'restored', source: draft.source }
  } catch { return { status: 'unavailable' } }
}
export function saveDraft(storage, board, lesson, source) {
  try {
    if (typeof source !== 'string' || source.length > MAX_SOURCE) return false
    storage.setItem(keyFor(board, lesson), JSON.stringify({ version: 1, board, lesson, source }))
    return true
  } catch { return false }
}
export function removeDraft(storage, board, lesson) {
  try { storage.removeItem(keyFor(board, lesson)); return true } catch { return false }
}
export function exportName(board, lesson) { keyFor(board, lesson); return `fit_${board}_${lesson}.ino` }
