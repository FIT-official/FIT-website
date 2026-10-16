import { familyRegistry } from '../../public/simulations/families/catalog.js'
// Curriculum levels are editorial starting points, not syllabus accreditation.
// Keep syllabusRef empty until a teacher has reviewed a specific syllabus.
export const SIMULATION_LEVELS = ['Primary', 'Secondary', 'JC', 'Poly', 'University']

export const simsRegistry = [
  {
    id: 'sampling',
    title: 'Signal Sampling Detective',
    level: 'JC',
    subject: 'Physics',
    topic: 'Waves and sampling',
    syllabusRef: '',
    approach: 'Compare a hidden wave with the dots measured by a sensor. Use a compatible wave to discover why sampling rate matters.',
    activityPrompt: 'Predict which slower wave shares the samples of a 7 Hz signal measured 10 times per second. Then find a sampling rate that distinguishes frequencies up to 9 Hz.',
    status: 'live',
  },
  {
    id: 'feedback',
    title: 'Feedback Control Lab',
    level: 'Poly',
    subject: 'Engineering',
    topic: 'Feedback and control',
    syllabusRef: '',
    approach: 'Tune a simplified thermal system and compare proportional and integral control with delay, heat loss and limited heater power.',
    activityPrompt: 'Compare P and PI control, then test a delayed sensor. Aim for 250 seconds within 2 °C of a 50 °C target using less than 46 kJ during the 300-second disturbance trial.',
    status: 'live',
  },
  {
    id: 'base-rates',
    title: 'Evidence & Base Rates',
    level: 'Secondary',
    subject: 'Math',
    topic: 'Probability and evidence',
    syllabusRef: '',
    approach: 'Follow true and false flags through a natural-frequency table, then compare the expected counts with a repeatable synthetic batch.',
    activityPrompt: 'For a batch with 1% defects, 95% sensitivity and 95% specificity, predict the proportion of flagged parts that are defective. Explain the result using counts.',
    status: 'live',
  },
  {
    id: 'heat-path',
    title: 'Heat Path Designer',
    level: 'Secondary',
    subject: 'Physics',
    topic: 'Heat transfer',
    syllabusRef: '',
    approach: 'Build conducting paths and insulating barriers on an equal-capacity tile model. Compare designs at the same elapsed time.',
    activityPrompt: 'Design a path that warms target A while protecting probe B. Compare both probes at equal times, then test energy conservation with insulated boundaries.',
    status: 'live',
  },
  {
    id: 'ratio-sweets-share', title: 'Sweet Share', level: 'Primary', subject: 'Maths', topic: 'Ratio', syllabusRef: '',
    approach: 'Share a fixed number of sweets between character jars. Find one equal part, then scale two-part and three-part ratios.',
    activityPrompt: 'Drag sweets into the jars or use the sharing buttons. Use every sweet and match the given ratio, then explain the size of one part.',
    status: 'live',
  },
  {
    id: 'ratio-paint-mix', title: 'Paint Mix Studio', level: 'Primary', levels: ['Primary', 'Secondary'], subject: 'Maths', topic: 'Ratio', syllabusRef: '',
    approach: 'Measure paint drops to match a recipe and a batch size. Scale equivalent ratios while comparing illustrative colour swatches.',
    activityPrompt: 'Match the target paint ratio using exactly the requested number of drops. Explain why scaling every paint by the same factor preserves the recipe.',
    status: 'live',
  },
  {
    id: 'fractions-pizza-party', title: 'Pizza Party', level: 'Primary', subject: 'Maths', topic: 'Fractions', syllabusRef: '',
    approach: 'Cut one pizza into equal slices and serve fractions of the whole. Connect equivalent fractions with adding like denominators.',
    activityPrompt: 'Choose the equal cuts and serve the target fraction. Show an equivalent portion and explain why the denominator stays the same when adding equal-sized slices.',
    status: 'live',
  },
  {
    id: 'fractions-number-line-jump', title: 'Fraction Frog', level: 'Primary', levels: ['Primary', 'Secondary'], subject: 'Maths', topic: 'Fractions', syllabusRef: '',
    approach: 'Place a frog on equal number-line intervals. Compare and order fractions, then locate mixed numbers beyond one whole.',
    activityPrompt: 'Aim and land on the target fractions. For ordered jumps, visit them from smallest to largest and explain each position using a common unit.',
    status: 'live',
  },
  ...familyRegistry,
]
