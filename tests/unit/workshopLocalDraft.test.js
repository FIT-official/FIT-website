import { describe, it, expect } from 'vitest'
import { emptyWorkshopDraft, validateWorkshopDraft, missingWorkshopAnswers, workshopAnswerExport, workshopDraftKey } from '@/lib/workshopDraft'
const fields = [{ id: 'person', label: 'The person and place' }, { id: 'test', label: 'Our fair test' }]
const complete = () => ({ version: 1, group: 'g1', idea: '2', answers: { person: 'A person using the model', test: 'Keep the same objects and compare five times.' } })
describe('browser-local workshop answers', () => {
    it('uses a different save key for each valid group', () => {
        expect(new Set(Array.from({ length: 10 }, (_, i) => workshopDraftKey('g' + (i + 1)))).size).toBe(10)
        expect(() => workshopDraftKey('g01')).toThrow()
        expect(() => workshopDraftKey('g11')).toThrow()
    })
    it('starts without answers or an assumed idea choice', () => {
        expect(missingWorkshopAnswers(emptyWorkshopDraft('g1', fields), fields)).toEqual(['idea', 'person', 'test'])
    })
    it('rejects restoring another group over this group', () => {
        expect(() => validateWorkshopDraft(complete(), 'g2', fields)).toThrow('this group')
    })
    it('rejects unsupported versions, idea numbers and missing fields', () => {
        expect(() => validateWorkshopDraft({ ...complete(), version: 2 }, 'g1', fields)).toThrow()
        expect(() => validateWorkshopDraft({ ...complete(), idea: '3' }, 'g1', fields)).toThrow()
        expect(() => validateWorkshopDraft({ ...complete(), answers: { person: 'Only one' } }, 'g1', fields)).toThrow()
    })
    it('bounds imported text and rejects non-string or unknown answers', () => {
        for (const answers of [{ person: 'x'.repeat(1001), test: 'Okay' }, { person: {}, test: 'Okay' }, { ...complete().answers, unexpected: 'Extra' }]) expect(() => validateWorkshopDraft({ ...complete(), answers }, 'g1', fields)).toThrow()
    })
    it('preserves exact text in export and adds only group/questions/time', () => {
        const draft = complete(); draft.answers.person = '<script>Not executable answer text</script>'
        const exported = workshopAnswerExport(draft, fields)
        expect(exported.answers).toEqual(draft.answers)
        expect(exported.questions).toEqual({ person: 'The person and place', test: 'Our fair test' })
        expect(Object.keys(exported).sort()).toEqual(['answers', 'exportedAt', 'group', 'idea', 'questions', 'version'])
        expect(validateWorkshopDraft(JSON.parse(JSON.stringify(exported)), 'g1', fields)).toEqual(draft)
    })
    it('checks whitespace-only answers as incomplete without requiring claimed results', () => {
        const draft = complete(); draft.answers.test = '  '
        expect(missingWorkshopAnswers(draft, fields)).toEqual(['test'])
        draft.answers.test = 'We cannot test safely yet; this is our comparison plan.'
        expect(missingWorkshopAnswers(draft, fields)).toEqual([])
    })
})
