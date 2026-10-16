import { getLiveSim } from './registry'

export const MAX_CLASS_SIMULATIONS = 20

// Older lessons have no simIds field. Resolve every saved ID against the live
// registry so withdrawing an activity also removes it from classroom views.
export function classSimulationIds(lesson) {
    if (!Array.isArray(lesson?.simIds)) return []
    return [...new Set(lesson.simIds.filter(id => typeof id === 'string' && getLiveSim(id)))].slice(0, MAX_CLASS_SIMULATIONS)
}

export function classSimulations(lesson) {
    return classSimulationIds(lesson).map(id => getLiveSim(id))
}
