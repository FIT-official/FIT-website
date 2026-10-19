// Phase-1 class catalogue. Every entry is built from material that already exists on this site: live registry simulations,
// existing guides/services pages, or the existing workshop. A module is either 'available' (it links to something that works
// today) or 'planned' (named so learners can see the direction, but with NO link and no claim that it exists).
// No enrolment counts, ratings, progress or "popular" claims live here: none of that data exists.
import { getLiveSim } from '@/lib/sims/registry'

export const MODULE_STATUS = { available: 'available', planned: 'planned' }
const sim = id => ({ kind: 'simulation', id, status: 'available' })
const page = (title, href, note) => ({ kind: 'page', title, href, note, status: 'available' })
const planned = (title, note) => ({ kind: 'planned', title, note, status: 'planned' })

export const CLASSES = [
  {
    slug: 'ratio-and-fractions',
    title: 'Ratio and fractions by doing',
    level: 'Primary',
    subject: 'Maths',
    summary: 'Share sweets, mix paint, cut pizzas and hop a frog along a number line to see what ratios and fractions mean.',
    outcomes: ['Share a total in a given ratio and check every part adds up', 'Find equivalent ratios and fractions with pictures first, numbers second', 'Place and compare fractions on a number line'],
    teacherNote: 'Each game checks the board directly and has a text description, so it works for pairs on tablets or as a whole-class discussion.',
    modules: [sim('ratio-sweets-share'), sim('ratio-paint-mix'), sim('fractions-pizza-party'), sim('fractions-number-line-jump'), planned('Worked-example booklet', 'A printable set of questions that match the four games.')],
  },
  {
    slug: 'signals-and-control',
    title: 'Signals, sampling and feedback',
    level: 'Secondary to JC',
    subject: 'Physics and engineering',
    summary: 'Find out why sampling too slowly creates false signals, then tune a heater controller that has to cope with delay and limited power.',
    outcomes: ['Explain aliasing using the sampling rate and the signal frequency', 'Compare manual, proportional and PI control on the same heater', 'Read a step response and describe overshoot and steady error'],
    teacherNote: 'The two activities show the equations and assumptions beside the simulation and have bounded run times for a lesson slot.',
    modules: [sim('sampling'), sim('feedback'), sim('heat-path'), planned('Breadboard-to-sensor lesson', 'Connects these ideas to a real circuit; scheduled for the electronics classes.')],
  },
  {
    slug: 'evidence-and-base-rates',
    title: 'Evidence and base rates',
    level: 'Secondary to JC',
    subject: 'Maths',
    summary: 'See why a good test can still give mostly false alarms when the thing it looks for is rare.',
    outcomes: ['Turn a probability into natural frequencies', 'Work out how many flagged cases are real', 'Describe how the base rate changes the answer'],
    teacherNote: 'Pairs well with a discussion on medical screening or spam filters. Numbers are shown as counts, not only percentages.',
    modules: [sim('base-rates'), planned('Case-study set', 'Short written cases to discuss after the simulation.')],
  },
  {
    slug: 'design-thinking-workshop',
    title: 'Design thinking workshop: improve a classmate\'s idea',
    level: 'Secondary',
    subject: 'Design and making',
    summary: 'The FIT workshop in which groups publish two design ideas, give each other feedback and refine them. Runs in the existing workshop classroom.',
    outcomes: ['Describe a problem and a proposed solution clearly', 'Give useful feedback on two ideas from other groups', 'Revise a design using feedback'],
    teacherNote: 'Teachers run this from the existing teacher console. Students join through the existing workshop entry; this page does not change how that works.',
    modules: [page('Read the workshop write-up', '/blog/design-thinking-workshop', 'The published account of the workshop.'), page('Teacher console (sign-in required)', '/admin/workshop', 'Existing console for running the workshop and assigning simulations.')],
  },
  {
    slug: 'electronics-and-3d-printing',
    title: 'Electronics and 3D printing: from idea to part',
    level: 'Secondary and above',
    subject: 'Making',
    summary: 'Where to start with prototyping electronics and printing your own parts. The complete illustrated lessons are being written; the planning pages and the print request form work today.',
    outcomes: ['Know what a prototype circuit and a printed part can and cannot do', 'Ask for a print with a model file or a link', 'Find fix-it help for common print problems'],
    teacherNote: 'The full breadboard lesson is planned and is not published yet. Nothing here claims otherwise.',
    modules: [page('Request a 3D print', '/prints/request', 'Describe what you need and attach a model or paste a link. A person reviews it before any quote.'), page('3D printing problems guide', '/guides/3d-printing-problems', 'Existing troubleshooting guide.'), page('Electronics prototyping service', '/electronics-prototyping', 'What FIT can build with you.'), planned('Breadboard basics: a complete illustrated lesson', 'Objectives, worked examples, original schematics and exercises.'), planned('Designing a part for printing', 'From sketch to a printable model.')],
  },
]

export const getClass = slug => CLASSES.find(item => item.slug === slug) || null

// Resolve a module to display fields. A simulation that is no longer live is dropped rather than shown as a dead link.
export function resolveModule(entry) {
  if (entry.kind === 'simulation') {
    const live = getLiveSim(entry.id)
    return live ? { key: 'sim:' + entry.id, title: live.title, href: '/class/simulations/' + live.id, note: `${live.level} · ${live.subject} · ${live.minutes} min`, status: 'available', kind: 'simulation' } : null
  }
  return { key: entry.kind + ':' + entry.title, title: entry.title, href: entry.status === 'available' ? entry.href : null, note: entry.note || '', status: entry.status, kind: entry.kind }
}
export const classModules = item => item.modules.map(resolveModule).filter(Boolean)
export const availableCount = item => classModules(item).filter(module => module.status === 'available').length

// Starting points are the same for every visitor. The label says so: there is no preference or enrolment data to personalise from.
export const STARTING_POINTS = ['ratio-and-fractions', 'signals-and-control', 'design-thinking-workshop']
export const startingPoints = () => STARTING_POINTS.map(getClass).filter(Boolean)

// Programming: what exists, and what is only planned.
export const PROGRAMMING_PLAN = [
  { title: 'Write and run code in your browser', status: 'flagged', note: 'The Computing workspace exists but is switched on separately. The link below appears only when it is enabled.' },
  { title: 'Computing simulations', status: 'available', note: 'Browser activities that already sit in the simulation library under the Computing subject.' },
  { title: 'First programs: sequences, loops and decisions', status: 'planned', note: 'Representative complete lesson planned for the next phase.' },
  { title: 'Data and simple AI demos that run on your device', status: 'planned', note: 'No paid AI service is used or planned for these demos.' },
  { title: 'Programming for engineering and science', status: 'planned', note: 'Later roadmap; not started.' },
]
