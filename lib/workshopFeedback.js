export const WORKSHOP_SESSION = '2026-10-09'
export const FEEDBACK_FIELDS = ['whatWorks', 'question', 'improvement']
export function validateWorkshopFeedback(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Invalid feedback.')
    const keys = ['submissionId', 'session', 'presentingGroup', 'visitingGroup', 'idea', ...FEEDBACK_FIELDS]
    if (Object.keys(input).some(key => !keys.includes(key)) || input.session !== WORKSHOP_SESSION || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.submissionId || '')) throw Error('Invalid submission details.')
    if (!/^g(?:[1-9]|10)$/.test(input.presentingGroup || '') || !/^g(?:[1-9]|10)$/.test(input.visitingGroup || '') || input.presentingGroup === input.visitingGroup) throw Error('Choose different presenting and visiting groups.')
    if (!['1', '2'].includes(input.idea)) throw Error('Choose Idea 1 or Idea 2.')
    const result = Object.fromEntries(keys.slice(0, 5).map(key => [key, input[key]]))
    for (const key of FEEDBACK_FIELDS) {
        if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > 600 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input[key])) throw Error('Write feedback in all three fields, up to 600 characters each.')
        if (/\b[^\s@]+@[^\s@]+\.[^\s@]+\b|https?:\/\//i.test(input[key])) throw Error('Keep emails and private links out of feedback.')
        result[key] = input[key].trim()
    }
    return result
}
export function feedbackDraftKey(group) { return 'fit:gallery-walk:' + WORKSHOP_SESSION + ':' + group }
