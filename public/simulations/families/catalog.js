// Catalog entries for concept-family level variants (original FIT sims).
import { variants as ratio } from './ratio/variants.js'
import { variants as differentiation } from './differentiation/variants.js'

const SUBJECT = { ratio: 'Maths', differentiation: 'Maths' }
const subjectFor = v => (/chem/i.test(v.syllabus + v.topic) ? 'Chemistry' : /gear|mechan/i.test(v.topic) ? 'Engineering' : SUBJECT[v.concept] || 'Maths')
export const familyVariants = [...ratio, ...differentiation]
export const familyActivities = familyVariants.map(v => ({
  id: v.id, kind: 'family', concept: v.concept, title: v.title, shortTitle: v.title.split(':')[0], category: subjectFor(v), subjects: [...new Set([subjectFor(v), 'Maths'])],
  level: ['Introductory', 'Intermediate', 'Advanced'][v.difficulty - 1] || 'Intermediate', ages: { P: '9+', S: '13+', JC: '17+', Poly: '17+', U: '18+' }[v.levelCode] || '12+', minutes: '10–15', accent: v.accent, symbol: v.symbol,
  question: v.objective, description: v.objective, tags: v.tags || [], prediction: '', steps: [], teacher: v.syllabus || '', transfer: '', model: v.objective,
}))
export const familyRegistry = familyVariants.map(v => ({
  id: v.id, title: v.title, level: v.level, subject: subjectFor(v), topic: v.topic, syllabusRef: v.syllabus || '',
  approach: v.objective, activityPrompt: `Play all rounds, then explain: ${v.objective}`, status: 'live',
}))
