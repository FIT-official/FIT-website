export const WORKSHOP_DRAFT_VERSION = 1
export const MAX_ANSWER_LENGTH = 1000
export const workshopDraftKey = group => {
    if (!/^g(?:[1-9]|10)$/.test(group)) throw new Error('Unknown workshop group.')
    return 'fit:design-thinking:2026-10-09:' + group
}
export function emptyWorkshopDraft(group, fields) {
    workshopDraftKey(group)
    return { version: WORKSHOP_DRAFT_VERSION, group, idea: '', answers: Object.fromEntries(fields.map(field => [field.id, ''])) }
}
export function validateWorkshopDraft(value, group, fields) {
    if (!value || value.version !== WORKSHOP_DRAFT_VERSION || value.group !== group || !['', '1', '2'].includes(value.idea) || !value.answers || typeof value.answers !== 'object' || Array.isArray(value.answers)) throw new Error('Use an answer file for this group.')
    const expected = new Set(fields.map(field => field.id))
    if (Object.keys(value.answers).some(id => !expected.has(id)) || fields.some(field => typeof value.answers[field.id] !== 'string' || value.answers[field.id].length > MAX_ANSWER_LENGTH)) throw new Error('The answer file has missing or oversized fields.')
    return { ...emptyWorkshopDraft(group, fields), idea: value.idea, answers: Object.fromEntries(fields.map(field => [field.id, value.answers[field.id]])) }
}
export function missingWorkshopAnswers(draft, fields) {
    return [...(draft.idea ? [] : ['idea']), ...fields.filter(field => !draft.answers[field.id]?.trim()).map(field => field.id)]
}
export function workshopAnswerExport(draft, fields) {
    return { ...validateWorkshopDraft(draft, draft.group, fields), questions: Object.fromEntries(fields.map(field => [field.id, field.label])), exportedAt: new Date().toISOString() }
}
