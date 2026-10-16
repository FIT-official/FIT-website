import { gameActivities } from './games/catalog.js';

export const activities = [
  {
    id: 'sampling', title: 'Signal Sampling Detective', shortTitle: 'Sampling', category: 'Physics', subjects: ['Math', 'Physics', 'Computing'], level: 'Intermediate', ages: '14+', minutes: '15–25', accent: '#5361d8', symbol: '∿',
    question: 'Can a sensor tell two different waves apart?',
    description: 'Hide the source, inspect the sensor dots, then uncover a wave that agrees with every sample. Design a better sampling plan.',
    tags: ['waves', 'aliasing', 'frequency', 'Nyquist', 'sensors'],
    prediction: 'A 7 Hz signal is sampled 10 times per second. What slower wave could pass through exactly the same dots?',
    steps: ['Keep the source hidden. Change the phase and inspect the dots.', 'Reveal the compatible wave, then the source. Explain why both agree at the dots.', 'Use no more than 40 samples over 2 seconds. Find a rate that distinguishes every source frequency up to 9 Hz.'],
    teacher: 'Start at 7 Hz and 10 samples/s: the folded frequency is −3 Hz. The minus sign changes the wave direction/phase; its magnitude is 3 Hz. Compare 14 and 15 samples/s for a 7 Hz source. Exact Nyquist equality is phase-degenerate. The budget task works at 19 samples/s: 39 measurements including both endpoints.',
    transfer: 'What band-limit assumption is needed before the slower compatible wave can be called the recovered source?',
    model: 'y(t) = A sin(2πft + φ); samples occur at t = n/fₛ. f_fold = f − round(f/fₛ)fₛ. The signed folded sine has identical samples. Recovery needs fₛ > 2f and a known band limit. The plotted folded curve is a compatible sinusoid, not a general reconstruction algorithm.',
  },
  {
    id: 'feedback', title: 'Feedback Control Lab', shortTitle: 'Feedback', category: 'Engineering', subjects: ['Physics', 'Engineering', 'Math'], level: 'Advanced', ages: '14+', minutes: '20–30', accent: '#bc6529', symbol: '↻',
    question: 'Why does a heater overshoot its target?',
    description: 'Tune a temperature controller. Compare manual, P and PI control, delayed sensors, a cold-air disturbance and a limited heater.',
    tags: ['temperature', 'PID', 'control', 'energy', 'delay'],
    prediction: 'Will doubling the proportional gain always get the room closer to its target?',
    steps: ['Compare P and PI at 60 °C. Read the final error and heater energy.', 'Add 20 seconds of sensor delay and increase gain. Watch for overshoot.', 'Reset, set a 50 °C target and enable the cold-air disturbance. Aim for at least 250 s within ±2 °C using less than 46 kJ over 300 s. Tune gains and delay; check reachability first.'],
    teacher: 'P control needs a persistent error to supply heat. Integral action can reduce that error, but saturation and sensing delay matter. The heater limit is Tout + Pmax/G. Energy and time in the ±2 °C band are measured over the displayed 300 s run; this is a simplified teaching plant.',
    transfer: 'How could a delayed sensor make the controller keep heating after the real temperature has reached the target?',
    model: 'C dT/dt = Pmax·u − G(T − Tout); e = Ttarget − Tsensed; u = clamp(Kp·e + Ki·I, 0, 1). Conditional integration limits windup. Explicit Euler uses a fixed 0.1 s step, independent of rendering. One well-mixed thermal mass; no spatial gradients. A disturbance lowers outside temperature by 10 °C at 150 s.',
  },
  {
    id: 'base-rates', title: 'Evidence & Base Rates', shortTitle: 'Base rates', category: 'Math', subjects: ['Math', 'Statistics'], level: 'Introductory', ages: '13+', minutes: '10–20', accent: '#087c72', symbol: '%',
    question: 'Does a 95% detector make a flag 95% certain?',
    description: 'Inspect a synthetic batch of components. Follow defects and false alarms through a natural-frequency table, then compare a seeded sample.',
    tags: ['probability', 'Bayes', 'statistics', 'inspection', 'false positives'],
    prediction: 'Only 1% of components are defective. The inspector catches 95% of defects and flags 5% of sound parts. Of the flagged parts, how many are defective?',
    steps: ['Use expected mode and read the four groups. Compare 95 true flags with 495 false alarms.', 'Change the defect rate without changing the inspector. Explain why the meaning of a flag changes.', 'Switch to sampled mode; keep the seed fixed to repeat a batch. Allocate 100 second checks: how many flagged parts would still be unchecked?'],
    teacher: 'Sensitivity is P(flag | defect); the displayed posterior is P(defect | flag). Expected counts may be fractional. Seeded batches fluctuate and are synthetic. A zero denominator has no defined conditional probability. No independent second-test assumption is built into this activity.',
    transfer: 'Which improvement would reduce false alarms more: higher specificity or higher sensitivity? Why?',
    model: 'P(D | +) = ps / [ps + (1 − p)(1 − specificity)]. Expected TP = Nps, FP = N(1 − p)(1 − specificity), FN = Np(1 − s), TN = N(1 − p)·specificity. Sample mode draws defect and flag states with a seeded pseudorandom generator. This is a fictional inspection example.',
  },
  {
    id: 'heat-path', title: 'Heat Path Designer', shortTitle: 'Heat paths', category: 'Physics', subjects: ['Physics', 'Engineering'], level: 'Intermediate', ages: '12+', minutes: '20–30', accent: '#b84b50', symbol: '▦',
    question: 'Can you steer heat while protecting a region?',
    description: 'Paint conducting paths and insulating barriers on a plate. Compare the target and protected probes as heat flows across material interfaces.',
    tags: ['heat', 'diffusion', 'conductivity', 'conservation', 'design'],
    prediction: 'What path will warm target A while keeping protected probe B cool?',
    steps: ['Pause and paint a route from the hot edge to A. Add a barrier around B.', 'Step or run the model. Record both probes at the same elapsed time.', 'Reset first, then switch to insulated boundaries. Explain why the plate mean stays constant even though the temperature map changes.'],
    teacher: 'Tiles share equal heat capacity (1 J/K); brush values change conductance, not capacity. Black insulator tiles have zero conductance, so an enclosing barrier isolates a region. Fixed edge reservoirs supply/remove heat; insulated boundaries conserve total stored energy. Compare designs at equal times after reset.',
    transfer: 'Why is a fixed-temperature hot edge different from a finite hot object that is allowed to cool?',
    model: 'cᵢ dTᵢ/dt = Σⱼ gᵢⱼ(Tⱼ − Tᵢ), with cᵢ = 1 J/K and harmonic-mean face conductance gᵢⱼ in W/K. The 16 × 12 equal-tile network uses explicit Euler at 0.2 s (≤0.25 s stability bound). Top/bottom are insulated. Left/right are fixed reservoirs or insulated. It excludes convection and radiation and does not predict a named real material.',
  },
  ...gameActivities,
];

export function findActivity(id) { return activities.find(activity => activity.id === id); }
export function filterActivities({ query = '', subject = 'All', level = 'All' } = {}) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return activities.filter(activity => (subject === 'All' || activity.subjects.includes(subject)) && (level === 'All' || activity.level === level) && words.every(word => [activity.title, activity.question, activity.description, ...activity.tags, ...activity.subjects].join(' ').toLowerCase().includes(word)));
}
