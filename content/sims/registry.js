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
]
