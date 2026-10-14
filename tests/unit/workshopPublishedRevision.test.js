import { describe, expect, it } from 'vitest'
import { randomUUID, createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { memoryDb } from '../groupCanvas/memory.mjs'
import publication from '@/content/workshopPublishedRevisions.json'
import { workshopGroupPage, workshopClassroomGroupPage } from '@/lib/workshopPages'
import { PROJECT_VERSION, assignedReview } from '@/lib/workshopReview'
import { canvasReferenceFor, designPrompts, resolveCanvasReference } from '@/lib/workshopPublication'
import { refinementFields, fieldsForRefinement, labelsForRefinement, emptyRefinement, startRefinement } from '@/lib/workshopRefinement'
import { newGuest, guestAccess } from '@/lib/workshopGuestIdentity'
import { saveWorkshopDraft, draftId, draftView } from '@/lib/workshopGuestDraftStore'
import { emptyLesson, submitClassroom, moderateClassroom } from '@/lib/workshopGuestClassroomStore'
import { writeCanvas, readCanvas } from '@/lib/workshopCanvasStore'
import { blankCanvas, shapeObject, validCanvas } from '@/lib/workshopCanvasModel'
import { backupRows, backupColumns } from '@/lib/workshopBackupWorkbook'

const now = new Date('2026-10-16T00:00:00Z'), access = guestAccess(newGuest('g10', 'Synthetic learner', now).record, now)
describe('additive publication and recoverable edits', () => {
    it('preserves the existing project assignments and twenty original byte hashes', () => {
        expect(PROJECT_VERSION).toBe('d3325767c6ddb337')
        expect(assignedReview({ reviewRound: 4, projectVersion: PROJECT_VERSION }, 'g10')).toEqual({ round: 4, target: 'g4', projectVersion: PROJECT_VERSION })
        expect(Object.values(publication.ideas).filter(item => item.status === 'revised')).toHaveLength(16)
        for (const item of Object.values(publication.ideas)) for (const image of [item.original, item.asset].filter(Boolean)) {
            const bytes = fs.readFileSync(path.join(process.cwd(), 'public', image.src))
            expect(createHash('sha256').update(bytes).digest('hex')).toBe(image.sha256)
        }
    })
    it('renders the selected Group 10 decision consistently while keeping the original', () => {
        const publicGroup = workshopGroupPage('g10'), classroom = workshopClassroomGroupPage('g10')
        expect(publicGroup.ideas[0].pupilCopy).toEqual(classroom.reading.ideas[0].pupilCopy)
        expect(publicGroup.ideas[0].pupilCopy.solution).toContain('captions-only')
        expect(publicGroup.ideas[0].pupilCopy.revisionDecision).toContain('not unanimous')
        expect(publicGroup.models[0].src).toBe(classroom.reading.ideas[0].illustrations[0].src)
        expect(publicGroup.ideas[0].pupilCopy.originalDrawing).toContain('reviewed-v2')
        expect(workshopGroupPage('g1').models[1].src).toContain('reviewed-v2')
    })
    it('offers authored per-idea manual instructions and anonymized copyable prompts', () => {
        for (let group = 1; group <= 10; group++) for (const idea of workshopGroupPage('g' + group).ideas) {
            const copy = idea.pupilCopy, prompts = designPrompts(copy)
            expect(copy.modellingSteps).toHaveLength(3)
            expect(prompts.drawing).toContain('black line style with teal labels')
            expect(prompts.modelling).toContain('Do not invent dimensions')
            expect(prompts.modelling).toContain('duplicate')
            expect(JSON.stringify(prompts)).not.toMatch(/@|studentName|reference.*[a-f0-9]{24}/)
        }
    })
    it('fills only empty problem/solution fields and preserves version 1–3 submission schemas', () => {
        const idea = workshopGroupPage('g10').ideas[0], old = { ...emptyRefinement(), problemStatement: 'My edited problem', solutionDescription: 'My edited solution' }
        expect(startRefinement(old, idea)).toEqual(old)
        expect(startRefinement(emptyRefinement(), idea).solutionDescription).toBe(idea.pupilCopy.solution)
        expect(fieldsForRefinement(3)).not.toContain('solutionDescription')
        expect(fieldsForRefinement(4)).toContain('solutionDescription')
        expect(labelsForRefinement(1)).toHaveProperty('feedbackUsed')
    })
    it('saves, reloads and exports solution edits without pruning the original or accepting a stale writer', async () => {
        const db = memoryDb(), store = db.collection('synthetic-drafts'), topic = 'refinement-g10-idea1', legacy = { feedbackUsed: '', change: 'Old change', reason: '', test: '' }
        const first = { seat: access.seat, topic, expectedVersion: 0, requestId: randomUUID(), content: legacy }
        await saveWorkshopDraft(store, access, first, now)
        const second = { ...first, expectedVersion: 1, requestId: randomUUID(), content: { ...legacy, problemStatement: 'Edited problem', solutionDescription: 'Edited solution' } }
        await saveWorkshopDraft(store, access, second, now)
        await expect(saveWorkshopDraft(store, access, { ...second, requestId: randomUUID() }, now)).rejects.toMatchObject({ status: 409 })
        const row = await store.findOne({ _id: draftId(access.seat, topic) })
        expect(draftView(row).snapshots.at(-1).content.solutionDescription).toBe('Edited solution')
        expect(row.snapshots[0].content).toEqual(legacy)
        expect(backupColumns.Improvements.map(column => column[0])).toContain('solutionDescription')
        expect([...backupRows({ type: 'refinement', ideas: [{ idea: '1', answers: second.content }] })][0].values.solutionDescription).toBe('Edited solution')
    })
    it('stores v4 submissions and teacher edits with before/after history and repeatable receipts', async () => {
        const store = memoryDb().collection('synthetic-lessons'); await store.insertOne({ ...emptyLesson(), refinementOpen: true })
        const ideas = [1, 2].map(i => Object.fromEntries(refinementFields.map(key => [key, key + ' idea ' + i])))
        const input = { kind: 'refinement', promptVersion: 4, submissionId: randomUUID(), expectedVersion: 0, expectedEntryVersion: 0, phaseVersion: 0, ideas }
        const saved = await submitClassroom(store, access, input, now)
        expect(await submitClassroom(store, access, input, now)).toEqual(saved)
        const edited = structuredClone(ideas); edited[0].solutionDescription = 'Teacher clarification'
        await moderateClassroom(store, { role: 'teacher', userId: 'synthetic-teacher' }, { action: 'refinement', id: input.submissionId, expectedEntryVersion: 1, visibility: 'visible', edit: { ideas: edited } }, now)
        const row = await store.findOne({ _id: emptyLesson()._id })
        expect(row.audit.at(-1).before.ideas[0].solutionDescription).toBe(ideas[0].solutionDescription)
        expect(row.refinements[0].ideas[0].solutionDescription).toBe('Teacher clarification')
    })
    it('pins approved illustration references to the exact group/idea and rejects URLs or unknown versions', async () => {
        const store = memoryDb().collection('synthetic-canvases'), document = { ...blankCanvas(), reference: canvasReferenceFor('g10', '1'), objects: [shapeObject('rect', [20, 20], [100, 100], { colour: '#234e48', fill: 'none', size: 4 }, randomUUID())] }
        expect(validCanvas(document)).toBe(true)
        expect(resolveCanvasReference({ key: document.reference.key, version: 999 })).toBeNull()
        expect(validCanvas({ ...document, reference: { ...document.reference, url: 'https://example.test' } })).toBe(false)
        const input = { action: 'draft', requestId: randomUUID(), expectedVersion: 0, expectedSeat: access.seat, document }
        await writeCanvas(store, access, 'g10', '1', input, { now })
        expect((await readCanvas(store, access, 'g10', '1')).document).toEqual(document)
        await expect(writeCanvas(store, access, 'g10', '2', { ...input, requestId: randomUUID() }, { now })).rejects.toThrow('Use the illustration')
        expect((await readCanvas(store, access, 'g10', '1')).history).toHaveLength(1)
    })
})
