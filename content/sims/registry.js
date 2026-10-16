import { LIVE_FAMILY } from '../../public/simulations/families/live.js'
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
  { id: "linear-plant-tracker", title: "Plant Tracker", level: "Primary", subject: "Maths", topic: "Line graphs", syllabusRef: "", concept: "linear-graphs", difficulty: 1, objective: "Read and interpret values, increases and the steepest part of a line graph.", syllabusSource: "PriMaths 2021 §P4 Tables, Line Graphs and Pie Charts 1.1–1.2, p.40", approach: "A sunflower’s height was measured every week. Read the line graph to answer each question.", activityPrompt: "Read and interpret values, increases and the steepest part of a line graph.", status: LIVE_FAMILY.includes('linear-plant-tracker') ? 'live' : 'draft' },
  { id: "linear-ramp-rescue", title: "Ramp Rescue", level: "Secondary", subject: "Maths", topic: "Linear graphs", syllabusRef: "", concept: "linear-graphs", difficulty: 1, objective: "Plot y = mx + c and interpret the gradient as vertical change over horizontal change.", syllabusSource: "SecMaths G3 2020 §N6 Functions and graphs 6.1–6.5, p.18", approach: "Tune the gradient and the y-intercept so the ramp passes through every checkpoint.", activityPrompt: "Plot y = mx + c and interpret the gradient as vertical change over horizontal change.", status: LIVE_FAMILY.includes('linear-ramp-rescue') ? 'live' : 'draft' },
  { id: "linear-best-fit", title: "Best-Fit Sniper", level: "JC", subject: "Maths", topic: "Correlation and regression", syllabusRef: "", concept: "linear-graphs", difficulty: 2, objective: "Find the least-squares regression line of y on x and interpret r and the residuals.", syllabusSource: "H2 Maths 9758 2027 §6.6 Correlation and linear regression, p.13", approach: "Line up the regression line of y on x by shrinking the sum of squared residuals.", activityPrompt: "Find the least-squares regression line of y on x and interpret r and the residuals.", status: LIVE_FAMILY.includes('linear-best-fit') ? 'live' : 'draft' },
  { id: "linear-sensor-calibration", title: "Sensor Calibrator", level: "Poly", subject: "Maths", topic: "Linear models", syllabusRef: "", concept: "linear-graphs", difficulty: 2, objective: "Build a two-point linear calibration and use it to convert sensor readings to engineering units.", syllabusSource: "Poly, Engineering Mathematics (FIT mapping; e.g. NP N71 Engineering Mathematics 1: analytic geometry)", approach: "Turn raw sensor readings into real units with a two-point calibration line.", activityPrompt: "Build a two-point linear calibration and use it to convert sensor readings to engineering units.", status: LIVE_FAMILY.includes('linear-sensor-calibration') ? 'live' : 'draft' },
  { id: "linear-systems-crossing", title: "Crossing Point", level: "University", subject: "Maths", topic: "Linear algebra", syllabusRef: "", concept: "linear-graphs", difficulty: 3, objective: "Solve 2 × 2 linear systems geometrically and with determinants, and identify singular systems.", syllabusSource: "University, Linear Algebra (FIT mapping)", approach: "Each equation is a line. Find where they cross, and spot when a system has no single solution.", activityPrompt: "Solve 2 × 2 linear systems geometrically and with determinants, and identify singular systems.", status: LIVE_FAMILY.includes('linear-systems-crossing') ? 'live' : 'draft' },
  ...familyRegistry,
]
