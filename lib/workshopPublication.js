import publication from '../content/workshopPublishedRevisions.json'
import worksheets from '../content/designThinkingWorksheets.json'
import originals from '../content/designThinkingWorkshopImages.json'

export const WORKSHOP_CONTENT_REVISION = publication.version
export const publishedIdea = key => typeof key === 'string' && Object.hasOwn(publication.ideas, key) ? publication.ideas[key] : null
export function publishedCopy(copy) {
    const revision = publishedIdea(copy?.key)
    if (!copy || !revision) return copy
    const solution = revision.solution || copy.solution, steps = revision.steps || copy.how_it_works_steps
    return { ...copy, solution, how_it_works_steps: steps, how_it_works: steps.map((step, i) => `${i + 1}. ${step}`).join('\n'), next_test: revision.nextTest || copy.next_test,
        key_points: [copy.target_user, copy.core_problem, solution], publicationRevision: WORKSHOP_CONTENT_REVISION, revisionNotes: revision.changes, revisionDecision: revision.decision,
        originalDrawing: revision.original.src, modellingSteps: revision.modellingSteps }
}
export function canvasReferenceFor(group, idea) {
    const key = worksheets.find(row => row.group === group)?.imageKeys[Number(idea) - 1]
    return key ? { key, version: publishedIdea(key)?.asset ? 4 : 3 } : null
}
export function resolveCanvasReference(reference) {
    if (!reference || typeof reference !== 'object' || Array.isArray(reference) || typeof reference.key !== 'string' || Object.keys(reference).some(key => !['key', 'version'].includes(key))) return null
    return reference.version === 3 && Object.hasOwn(originals, reference.key) ? originals[reference.key] : reference.version === 4 ? publishedIdea(reference.key)?.asset || null : null
}
export function referenceMatchesIdea(reference, group, idea) {
    return !reference || Boolean(resolveCanvasReference(reference) && canvasReferenceFor(group, idea)?.key === reference.key)
}
export function designPrompts(copy) {
    const shared = `Anonymous classroom design: ${copy.title}.\nProblem: ${copy.core_problem}.\nSolution: ${copy.solution}.\nVisible operation: ${copy.how_it_works_steps.join(' ')}\nDesign changes to explore: ${(copy.revisionNotes || []).join(' ') || 'Keep the current idea and ask what is unclear.'}\nUse only this anonymized description. No names, faces, school, class codes, account details or private files. Known dimensions have not been supplied; ask for measurements and leave unknowns labelled.`
    return {
        drawing: `${shared}\nCreate a clear 2D concept drawing in the supplied drawing's simple black line style with teal labels on white. Show the main parts, arrows for how it works and a small detail of the proposed change. Label proposed parts as proposals. Preserve the original purpose; do not invent working electronics or performance. The teacher will compare it with the original before using it.`,
        modelling: `${shared}\nGive beginner Tinkercad instructions using basic solids, holes, Align and Group. Separate moving parts and electronic placeholders. Do not invent dimensions, change an existing project or provide executable code. Ask the teacher to verify the exact project, units, fit and clearances. Start from a duplicate in the assigned workspace and retain the original. Explain what this model cannot demonstrate.`,
    }
}
