import { createHash } from 'node:crypto'
import { WORKSHOP_SESSION, validateWorkshopFeedback } from './workshopFeedback'
import { validSeat, groupForSeat } from './workshopCredentials'
import { assignedReview, PROJECT_VERSION } from './workshopReview'
export class ClassroomError extends Error { constructor(message, status = 400) { super(message); this.status = status } }
export const PHASES = ['PRESENT', 'FEEDBACK', 'REFINE']
export const emptyLesson = () => ({ _id: WORKSHOP_SESSION, version: 0, phaseVersion: 0, reviewRound: 1, projectVersion: PROJECT_VERSION, phase: 'PRESENT', feedbackOpen: false, refinementOpen: false, showFeedback: false, feedback: [], refinements: [], audit: [] })
export async function readLesson(store) { return await store.findOne({ _id: WORKSHOP_SESSION }) || emptyLesson() }
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const receipt = entry => ({ receipt: entry.id, recordedAt: entry.recordedAt, version: entry.version, confirmed: true })
export function classroomView(state, access) {
    const teacher = access.role === 'teacher'
    const latest = state.refinements.filter(row => row.group === access.group && row.seat === access.seat).at(-1)
    return { version: state.version, phaseVersion: state.phaseVersion, phase: state.phase, feedbackOpen: state.feedbackOpen, refinementOpen: state.refinementOpen, showFeedback: state.showFeedback, role: access.role, group: access.group,
        feedback: (teacher ? state.feedback : state.showFeedback ? state.feedback.filter(row => row.visibility === 'visible' && row.presentingGroup === access.group) : []).map(({ payloadHash, ...row }) => teacher ? row : ({ id: row.id, presentingGroup: row.presentingGroup, visitingGroup: row.visitingGroup, seat: row.seat, idea: row.idea, whatWorks: row.whatWorks, question: row.question, improvement: row.improvement, recordedAt: row.recordedAt })),
        refinements: state.refinements.filter(row => teacher || (row.group === access.group && (!row.visibility || row.visibility === 'visible'))).map(({ payloadHash, ...row }) => ({ ...row, entryVersion: row.entryVersion || 1 })),
        ...(!teacher ? { assignment: assignedReview(state, access.group), refinementVersion: latest ? latest.authorVersion || latest.version : 0, refinementEntryVersion: latest ? latest.entryVersion || 1 : 0 } : { reviewRound: state.reviewRound || 1, projectVersion: state.projectVersion || PROJECT_VERSION, currentProjectVersion: PROJECT_VERSION }),
        ...(teacher ? { audit: state.audit, progress: Array.from({ length: 10 }, (_, i) => { const group = 'g' + (i + 1); return { group, received: state.feedback.filter(r => r.presentingGroup === group && r.visibility === 'visible').length, submitted: state.feedback.filter(r => r.visitingGroup === group).length, refinementVersion: state.refinements.filter(r => r.group === group).at(-1)?.version || 0 } }) } : {}) }
}
// All phase state, feedback and revisions share one bounded lesson document.
// Compare-and-swap makes phase gates atomic with the write, without a new index
// or a transaction dependency. Mongo's existing unique _id provides creation CAS.
async function mutate(store, change) {
    for (let attempt = 0; attempt < 20; attempt++) {
        const state = await readLesson(store), result = change(state)
        if (result.unchanged) return result.response
        const next = { ...result.state, version: state.version + 1 }
        if (JSON.stringify(next).length > 4_000_000) throw new ClassroomError('The class record is full. Please ask your teacher.', 429)
        if (state.version === 0 && !await store.findOne({ _id: WORKSHOP_SESSION })) {
            try { await store.insertOne(next); return result.response } catch (error) { if (error.code !== 11000) throw error }
        } else {
            const saved = await store.replaceOne({ _id: WORKSHOP_SESSION, version: state.version }, next)
            if (saved.modifiedCount) return result.response
        }
        await new Promise(resolve => setTimeout(resolve, 2 + Math.random() * Math.min(60, 4 * (attempt + 1))))
    }
    throw new ClassroomError('The class changed while saving. Your draft is safe; please retry.', 409)
}
function text(value) { if (typeof value !== 'string' || !value.trim() || value.length > 600 || /\b[^\s@]+@[^\s@]+\.[^\s@]+\b|https?:\/\/|[\u0000-\u0008]/i.test(value)) throw new ClassroomError('Write each response without names, contact details or links (up to 600 characters).'); return value.trim() }
export async function submitClassroom(store, access, input, now = new Date()) {
    if (access.role !== 'student' || !validSeat(access.seat) || groupForSeat(access.seat) !== access.group) throw new ClassroomError('A verified student session is required.', 403)
    if (!input || !['feedback', 'refinement'].includes(input.kind) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.submissionId || '')) throw new ClassroomError('Invalid submission.')
    let content
    if (input.kind === 'feedback') {
        const { kind, phaseVersion, reviewRound, projectVersion, ...payload } = input
        if (payload.visitingGroup !== access.group) throw new ClassroomError('Use your assigned visiting group.', 403)
        try { content = { ...validateWorkshopFeedback(payload), seat: access.seat, reviewRound: reviewRound ?? null, projectVersion: projectVersion ?? null } }
        catch (error) { throw new ClassroomError(error.message) }
    } else {
        if (Object.keys(input).some(k => !['kind', 'submissionId', 'phaseVersion', 'expectedVersion', 'expectedEntryVersion', 'ideas'].includes(k)) || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 0 || (input.expectedEntryVersion !== undefined && (!Number.isInteger(input.expectedEntryVersion) || input.expectedEntryVersion < 0)) || !Array.isArray(input.ideas) || input.ideas.length !== 2) throw new ClassroomError('Include improvements for both ideas.')
        content = { group: access.group, seat: access.seat, ideas: input.ideas.map((idea, i) => {
            if (!idea || Object.keys(idea).some(k => !['feedbackUsed', 'change', 'reason', 'test'].includes(k))) throw new ClassroomError('Invalid idea refinement.')
            return { idea: String(i + 1), feedbackUsed: text(idea.feedbackUsed), change: text(idea.change), reason: text(idea.reason), test: text(idea.test) }
        }) }
    }
    const payloadHash = hash({ ...content, submissionId: undefined }), id = input.submissionId
    return mutate(store, state => {
        const previous = [...state.feedback, ...state.refinements].find(row => row.id === id)
        if (previous) {
            if (previous.payloadHash !== payloadHash || previous.seat !== access.seat || (previous.visitingGroup || previous.group) !== access.group) throw new ClassroomError('This receipt belongs to different content. Keep your draft and start a new submission.', 409)
            return { unchanged: true, response: receipt(previous) }
        }
        if (now >= new Date('2026-10-11T00:00:00Z')) throw new ClassroomError('The class session has expired.', 410)
        const phase = input.kind === 'feedback' ? 'FEEDBACK' : 'REFINE', open = input.kind === 'feedback' ? state.feedbackOpen : state.refinementOpen
        if (state.phase !== phase || !open || input.phaseVersion !== state.phaseVersion) throw new ClassroomError('The teacher changed or closed this stage. Your draft is kept; refresh the lesson state.', 409)
        const recent = [...state.feedback, ...state.refinements].filter(row => (row.visitingGroup || row.group) === access.group && Date.parse(row.recordedAt) > now.getTime() - 60_000)
        if (recent.length >= 30 || state.feedback.length >= 500 || state.refinements.length >= 200) throw new ClassroomError('Please wait before submitting again, or ask your teacher.', 429)
        const assignment = assignedReview(state, access.group)
        if (input.kind === 'feedback' && assignment.projectVersion !== PROJECT_VERSION) throw new ClassroomError('The project changed during this round. Your draft is kept; ask the teacher to reconcile it.', 409)
        if (input.kind === 'feedback' && ((input.reviewRound !== undefined && input.reviewRound !== assignment.round) || (input.projectVersion !== undefined && input.projectVersion !== assignment.projectVersion))) throw new ClassroomError('The review assignment or project changed. Compare the new project before submitting.', 409)
        let version = 1, authorVersion
        if (input.kind === 'refinement') {
            const latest = state.refinements.filter(row => row.group === access.group && row.seat === access.seat).at(-1)
            if (input.expectedVersion !== (latest ? latest.authorVersion || latest.version : 0)) throw new ClassroomError('Your other device submitted a newer contribution. Your draft is kept; compare your saved version before submitting.', 409)
            if ((input.expectedEntryVersion ?? (latest ? 1 : 0)) !== (latest ? latest.entryVersion || 1 : 0)) throw new ClassroomError('The teacher updated this revision. Your draft is kept; compare the available revision before submitting.', 409)
            authorVersion = (latest ? latest.authorVersion || latest.version : 0) + 1
            version = (state.refinements.filter(row => row.group === access.group).at(-1)?.version || 0) + 1
        }
        const row = { ...content, id, payloadHash, version, recordedAt: now.toISOString(), visibility: 'visible', ...(input.kind === 'refinement' ? { authorVersion, entryVersion: 1 } : { reviewRound: assignment.round, projectVersion: assignment.projectVersion }) }
        const list = input.kind === 'feedback' ? 'feedback' : 'refinements'
        return { state: { ...state, [list]: [...state[list], row] }, response: receipt(row) }
    })
}
export async function moderateClassroom(store, access, input, now = new Date()) {
    if (access.role !== 'teacher' || !access.userId) throw new ClassroomError('Teacher access required.', 403)
    return mutate(store, state => {
        if (state.audit.length >= 2000) throw new ClassroomError('The moderation record is full.', 429)
        let next = { ...state }, before, after
        if (input.action === 'phase') {
            if (input.expectedVersion !== state.version) throw new ClassroomError('The class changed. Refresh before applying this teacher action.', 409)
            if (!PHASES.includes(input.phase) || !['feedbackOpen', 'refinementOpen', 'showFeedback'].every(k => typeof input[k] === 'boolean')) throw new ClassroomError('Invalid lesson settings.')
            before = { phase: state.phase, feedbackOpen: state.feedbackOpen, refinementOpen: state.refinementOpen, showFeedback: state.showFeedback, reviewRound: state.reviewRound || 1, projectVersion: state.projectVersion || PROJECT_VERSION }
            if (input.reviewRound !== undefined && ![1, 2].includes(input.reviewRound)) throw new ClassroomError('Choose review round 1 or 2.')
            if (input.reviewRound !== undefined && input.reviewRound !== (state.reviewRound || 1) && state.feedbackOpen) throw new ClassroomError('Close feedback before changing the review round.', 409)
            if (input.phase === 'FEEDBACK' && input.feedbackOpen && state.projectVersion && state.projectVersion !== PROJECT_VERSION) throw new ClassroomError('The project content changed. Close the stage and reconcile the project version before starting this round.', 409)
            after = { phase: input.phase, feedbackOpen: input.phase === 'FEEDBACK' && input.feedbackOpen, refinementOpen: input.phase === 'REFINE' && input.refinementOpen, showFeedback: input.showFeedback, reviewRound: input.reviewRound ?? state.reviewRound ?? 1, projectVersion: state.projectVersion || PROJECT_VERSION }
            next = { ...state, ...after, phaseVersion: state.phaseVersion + 1 }
        } else if (input.action === 'projectVersion') {
            if (input.expectedVersion !== state.version || state.feedbackOpen) throw new ClassroomError('Close feedback and refresh before reconciling the project version.', 409)
            before = { projectVersion: state.projectVersion || PROJECT_VERSION, phaseVersion: state.phaseVersion }
            after = { projectVersion: PROJECT_VERSION, phaseVersion: state.phaseVersion + 1 }
            next = { ...state, ...after }
        } else if (input.action === 'feedback') {
            const index = state.feedback.findIndex(row => row.id === input.id)
            if (index < 0) throw new ClassroomError('Feedback not found.', 404)
            if (!['visible', 'hidden', 'blocked'].includes(input.visibility)) throw new ClassroomError('Invalid visibility.')
            before = state.feedback[index]
            if (input.expectedEntryVersion !== before.version) throw new ClassroomError('This entry changed while you were editing. Your edit is kept; compare the latest entry before saving.', 409)
            after = { ...before, visibility: input.visibility, version: before.version + 1 }
            if (input.edit) for (const key of ['whatWorks', 'question', 'improvement']) after[key] = text(input.edit[key])
            // Keep the original payload hash so a lost-response retry confirms
            // its original receipt and cannot undo a teacher edit.
            next.feedback = state.feedback.map((row, i) => i === index ? after : row)
        } else if (input.action === 'refinement') {
            const index = state.refinements.findIndex(row => row.id === input.id)
            if (index < 0) throw new ClassroomError('Revision not found.', 404)
            before = state.refinements[index]
            if (input.expectedEntryVersion !== (before.entryVersion || 1)) throw new ClassroomError('This revision changed while you were editing. Your edit is kept; compare the latest entry before saving.', 409)
            if (!['visible', 'hidden', 'blocked'].includes(input.visibility)) throw new ClassroomError('Invalid visibility.')
            after = { ...before, visibility: input.visibility, entryVersion: (before.entryVersion || 1) + 1 }
            if (input.edit) {
                if (!Array.isArray(input.edit.ideas) || input.edit.ideas.length !== 2 || Object.keys(input.edit).some(key => key !== 'ideas')) throw new ClassroomError('Include edits for both ideas.')
                after.ideas = input.edit.ideas.map((idea, i) => {
                    if (!idea || Object.keys(idea).some(key => !['feedbackUsed', 'change', 'reason', 'test'].includes(key))) throw new ClassroomError('Invalid revision edit.')
                    return { idea: String(i + 1), ...Object.fromEntries(['feedbackUsed', 'change', 'reason', 'test'].map(key => [key, text(idea[key])])) }
                })
            }
            next.refinements = state.refinements.map((row, i) => i === index ? after : row)
        } else throw new ClassroomError('Invalid teacher action.')
        next.audit = [...state.audit, { action: input.action, id: input.id || null, actor: access.userId, at: now.toISOString(), before, after }]
        return { state: next, response: { saved: true, version: state.version + 1 } }
    })
}
