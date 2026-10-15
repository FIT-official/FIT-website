import { WORKSHOP_SESSION } from './workshopFeedback'
export const CANVAS_IMAGE_LIMITS = Object.freeze({ inputBytes: 4 * 1024 * 1024, previewBytes: 8 * 1024 * 1024, dimension: 4096, previewDimension: 2048, pixels: 16_000_000 })
export function canvasImageParts(key) { const match = /^(g(?:[1-9]|10))-([12])-([a-f0-9]{64})$/.exec(typeof key === 'string' ? key : ''); return match ? { group: match[1], idea: match[2], digest: match[3] } : null }
export function validCanvasImage(value) { return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === 'height,key,width' && canvasImageParts(value.key) && [value.width, value.height].every(n => Number.isInteger(n) && n > 0 && n <= CANVAS_IMAGE_LIMITS.previewDimension)) }
export function canvasImageMatches(value, group, idea) { const parts = value && canvasImageParts(value.key); return !value || Boolean(validCanvasImage(value) && parts.group === group && parts.idea === idea) }
export const canvasImageId = key => WORKSHOP_SESSION + ':canvas-image:' + key
export function canvasImageUrl(value) { const parts = validCanvasImage(value) && canvasImageParts(value.key); return parts ? '/api/workshop/guest/canvas-images?' + new URLSearchParams({ homeGroup: parts.group, idea: parts.idea, id: parts.digest }) : null }
