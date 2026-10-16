import { simsRegistry, SIMULATION_LEVELS } from '../../content/sims/registry.js'
import { activities } from '../../public/simulations/catalog.js'

export { SIMULATION_LEVELS, simsRegistry }

function mergeActivity(entry) {
  const original = activities.find(activity => activity.id === entry.id)
  return original ? { ...original, difficulty: original.level, ...entry } : null
}

// Discovery and all new entrypoints use this allowlist. Draft entries never leak
// into filters, class content or player snippets.
export function getLiveSims(registry = simsRegistry) {
  return registry.filter(entry => entry.status === 'live').map(mergeActivity).filter(Boolean)
}

export function getLiveSim(id, registry = simsRegistry) {
  return getLiveSims(registry).find(activity => activity.id === id) ?? null
}

export function filterSimulations({ query = '', subject = 'All', level = 'All', topic = 'All' } = {}, registry = simsRegistry) {
  const words = String(query).trim().toLowerCase().split(/\s+/).filter(Boolean)
  return getLiveSims(registry).filter(activity => {
    const searchable = [activity.title, activity.question, activity.description, activity.approach, activity.activityPrompt, activity.subject, activity.topic, activity.level, ...activity.tags, ...activity.subjects].join(' ').toLowerCase()
    return (subject === 'All' || activity.subject === subject || activity.subjects.includes(subject))
      && (level === 'All' || activity.level === level)
      && (topic === 'All' || activity.topic === topic)
      && words.every(word => searchable.includes(word))
  })
}

export function getSimulationFilterOptions(registry = simsRegistry) {
  const live = getLiveSims(registry)
  return {
    levels: SIMULATION_LEVELS,
    subjects: [...new Set(live.flatMap(activity => [activity.subject, ...activity.subjects]))].sort(),
    topics: [...new Set(live.map(activity => activity.topic))].sort(),
  }
}
