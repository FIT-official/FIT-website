export const legacyRefinementFields = ['feedbackUsed', 'change', 'reason', 'test']
export const versionThreeRefinementFields = ['problemStatement', 'illustrationNotes', 'change', 'reason', 'test']
export const refinementFields = ['problemStatement', 'solutionDescription', 'illustrationNotes', 'change', 'reason', 'test']
export const allRefinementFields = ['feedbackUsed', ...refinementFields]
export const refinementLabels = { problemStatement: 'Refined problem statement', solutionDescription: 'Description of our solution', illustrationNotes: 'Illustration changes and labels', change: 'What would you change to improve this idea?', reason: 'Why would this improve the idea?', test: 'How would you test this change?' }
export const fieldsForRefinement = version => version === 4 ? refinementFields : version === 3 ? versionThreeRefinementFields : version === 2 ? ['change', 'reason', 'test'] : legacyRefinementFields
export const labelsForRefinement = version => version !== 2 && version !== 3 && version !== 4 ? { feedbackUsed: 'Feedback used', change: 'Proposed change', reason: 'Reason', test: 'Next test' } : Object.fromEntries(fieldsForRefinement(version).map(key => [key, refinementLabels[key]]))
// Starting text is explicit and fills empty fields only. Stored pupil edits win.
export const startRefinement = (draft, idea) => ({ ...draft, problemStatement: draft.problemStatement || idea.pupilCopy?.core_problem || idea.improvedProblem || idea.originalProblem || '', solutionDescription: draft.solutionDescription || idea.pupilCopy?.solution || idea.originalSolution || '' })
export const emptyRefinement = () => Object.fromEntries(allRefinementFields.map(key => [key, '']))
