// Gallery model (DESIGN_SPEC §5–6): level / topic / difficulty chips, OR within a row, AND across rows,
// state mirrored in the URL as ?level=primary,secondary&topic=ratio&difficulty=easy.
export const GALLERY_LEVELS = [
  { key: 'primary', label: 'Primary', name: 'Primary' }, { key: 'secondary', label: 'Secondary', name: 'Secondary' },
  { key: 'jc', label: 'JC', name: 'JC' }, { key: 'poly', label: 'Poly', name: 'Poly' }, { key: 'uni', label: 'University', name: 'University' },
]
export const GALLERY_TOPICS = [
  { key: 'ratio', label: 'Ratio' }, { key: 'fractions', label: 'Fractions' }, { key: 'probability', label: 'Probability' },
  { key: 'heat', label: 'Heat' }, { key: 'waves', label: 'Waves' }, { key: 'control', label: 'Control' },
  { key: 'differentiation', label: 'Differentiation' }, { key: 'forces', label: 'Forces' }, { key: 'linear-graphs', label: 'Linear graphs' }, { key: 'circuits', label: 'Circuits' }, { key: 'energy', label: 'Energy' },
]
export const GALLERY_DIFFICULTIES = [{ key: 'easy', label: 'Easy', stars: 1 }, { key: 'medium', label: 'Medium', stars: 2 }, { key: 'hard', label: 'Hard', stars: 3 }]

const ORIGINAL_TOPIC = { 'ratio-sweets-share': 'ratio', 'ratio-paint-mix': 'ratio', 'fractions-pizza-party': 'fractions', 'fractions-number-line-jump': 'fractions', sampling: 'waves', feedback: 'control', 'base-rates': 'probability', 'heat-path': 'heat' }
const ORIGINAL_DIFFICULTY = { 'ratio-sweets-share': 'easy', 'ratio-paint-mix': 'medium', 'fractions-pizza-party': 'easy', 'fractions-number-line-jump': 'medium', sampling: 'hard', feedback: 'hard', 'base-rates': 'medium', 'heat-path': 'medium' }
export const GALLERY_ART = { 'ratio-sweets-share': 'sweet-share', 'ratio-paint-mix': 'paint-mix', 'fractions-pizza-party': 'pizza-party', 'fractions-number-line-jump': 'fraction-frog', sampling: 'sampling', feedback: 'feedback', 'base-rates': 'base-rates', 'heat-path': 'heat-path' }

export const levelKey = name => GALLERY_LEVELS.find(level => level.name === name)?.key ?? ''
export const topicKey = sim => ORIGINAL_TOPIC[sim.id] || sim.concept || ''
export const difficultyKey = sim => ORIGINAL_DIFFICULTY[sim.id] || ({ Introductory: 'easy', Intermediate: 'medium', Advanced: 'hard' })[sim.difficulty] || 'medium'
export const simLevels = sim => (sim.levels?.length ? sim.levels : [sim.level]).map(levelKey).filter(Boolean)

export const EMPTY_FILTERS = Object.freeze({ level: [], topic: [], difficulty: [] })

export function filterGallery(sims, { level = [], topic = [], difficulty = [] } = EMPTY_FILTERS) {
  return sims.filter(sim => (!level.length || simLevels(sim).some(key => level.includes(key)))
    && (!topic.length || topic.includes(topicKey(sim)))
    && (!difficulty.length || difficulty.includes(difficultyKey(sim))))
}

const ALLOWED = { level: GALLERY_LEVELS, topic: GALLERY_TOPICS, difficulty: GALLERY_DIFFICULTIES }
export function parseGalleryQuery(search = '') {
  const params = new URLSearchParams(search)
  return Object.fromEntries(Object.entries(ALLOWED).map(([row, options]) => [row,
    [...new Set((params.get(row) || '').split(',').map(value => value.trim().toLowerCase()))].filter(value => options.some(option => option.key === value))]))
}
export function galleryQuery(filters) {
  const params = new URLSearchParams()
  for (const row of Object.keys(ALLOWED)) if (filters[row]?.length) params.set(row, filters[row].join(','))
  const query = params.toString().replaceAll('%2C', ',')
  return query ? `?${query}` : ''
}
