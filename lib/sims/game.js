// Checkpoints assess the stated concepts, independently of simulator settings.
// Scores are local practice feedback, never experiment measurements or grades.
export const GAME_LEVELS = ['Notice', 'Explain', 'Apply']
export const PROGRESS_VERSION = 1

export const GAME_CHALLENGES = {
  sampling: [
    { id: 'alias', question: 'A 7 Hz sine wave is sampled at 10 samples/s. Which lower frequency can match its samples?', choices: ['3 Hz, with a suitable phase', '5 Hz, at every phase', '10 Hz, at every phase'], answer: 0, explanation: 'The signed folded frequency is 7 − 10 = −3 Hz. Its magnitude is 3 Hz; the sign affects phase. Matching samples alone does not establish the true source.' },
    { id: 'nyquist', question: 'To distinguish all sinusoidal sources up to 9 Hz, which sampling rate clears the Nyquist limit?', choices: ['9 samples/s', '18 samples/s', '19 samples/s'], answer: 2, explanation: 'Use a sampling rate strictly greater than twice the highest frequency: fs > 18 samples/s. Exact equality can be phase-degenerate.' },
    { id: 'bandlimit', question: 'What extra assumption lets you identify the recovered signal from its samples?', choices: ['A taller wave always removes ambiguity', 'The source has a known frequency band limit', 'The dots are drawn in the same colour'], answer: 1, explanation: 'A known band limit, together with a sufficient sampling rate and the sampling model, excludes higher-frequency aliases. The compatible curve in this activity is not a general reconstruction algorithm.' },
  ],
  feedback: [
    { id: 'loss', question: 'At a steady temperature above the surroundings, what must the heater do?', choices: ['Supply no power', 'Continuously replace the heat lost', 'Increase the temperature indefinitely'], answer: 1, explanation: 'At equilibrium, C dT/dt = 0, so heater power equals G(T − Tout). A warmer room still loses energy to its surroundings.' },
    { id: 'delay', question: 'Why can a delayed sensor increase overshoot?', choices: ['It makes heat capacity vanish', 'It removes heat loss', 'The controller acts on an earlier, cooler reading'], answer: 2, explanation: 'The sensed temperature can lag the actual temperature. The controller may keep supplying heat after the real temperature has reached the target.' },
    { id: 'limit', question: 'With Tout = 20 °C, Pmax = 240 W and G = 4 W/K, what is the highest steady temperature in this model?', choices: ['80 °C', '60 °C', '260 °C'], answer: 0, explanation: 'At full heater output, Pmax = G(T − Tout). Therefore Tmax = 20 + 240/4 = 80 °C. A controller cannot sustain a target above this physical limit.' },
  ],
  'base-rates': [
    { id: 'counts', question: 'In 10,000 parts, 1% are defective. Sensitivity is 95%. How many true flags are expected?', choices: ['9,500', '495', '95'], answer: 2, explanation: 'There are 100 expected defective parts; 95% of those gives 95 true flags. Sensitivity conditions on defective parts, not on flags.' },
    { id: 'posterior', question: 'With 95 true flags and 495 false alarms, about what fraction of flagged parts are defective?', choices: ['95%', '16.1%', '1%'], answer: 1, explanation: 'P(defect | flag) = 95/(95 + 495) ≈ 16.1%. The large number of sound parts means false alarms can outnumber true flags.' },
    { id: 'specificity', question: 'Keeping prevalence and sensitivity fixed, which change reduces expected false alarms?', choices: ['Increase specificity', 'Increase the batch size', 'Draw another seed and assume it proves an improvement'], answer: 0, explanation: 'Expected false alarms equal N(1 − prevalence)(1 − specificity). Higher specificity lowers the false-alarm fraction. A different seed only changes a synthetic sample.' },
  ],
  'heat-path': [
    { id: 'direction', question: 'Across a conducting link, which way does net heat flow?', choices: ['From cooler to hotter', 'From hotter to cooler', 'Always towards probe A'], answer: 1, explanation: 'The link term gij(Tj − Ti) transfers energy from the warmer tile to the cooler tile. Shared face conductance gives equal and opposite transfers.' },
    { id: 'insulator', question: 'What does a closed ring of zero-conductance tiles do in this model?', choices: ['It creates heat inside the ring', 'It changes every tile’s heat capacity', 'It isolates the enclosed region from conduction across the ring'], answer: 2, explanation: 'A face touching a zero-conductance tile has zero harmonic-mean conductance. No conductive heat crosses that barrier. Convection and radiation are excluded.' },
    { id: 'conservation', question: 'With all boundaries insulated, what stays constant as temperatures redistribute?', choices: ['Total stored thermal energy', 'Every individual tile temperature', 'Only the hottest tile temperature'], answer: 0, explanation: 'Internal transfers cancel in the total energy balance, and no heat crosses the boundary. Equal, fixed heat capacities also make the mean temperature constant, up to numerical rounding.' },
  ],
}

export function emptyProgress() { return { version: PROGRESS_VERSION, challenges: {} } }
export function progressKey(id) { return `fit:sims:progress:v${PROGRESS_VERSION}:${id}` }

export function scoreAnswer(attempts) {
  if (!Number.isInteger(attempts) || attempts < 1) return 0
  return Math.max(50, 125 - attempts * 25)
}

export function normaliseProgress(value, challenges = []) {
  const clean = emptyProgress()
  if (value?.version !== PROGRESS_VERSION || !value.challenges || typeof value.challenges !== 'object') return clean
  for (const challenge of challenges) {
    const entry = value.challenges[challenge.id]
    if (!entry || !Number.isInteger(entry.attempts) || entry.attempts < 1 || entry.attempts > 10000) continue
    const completed = entry.completed === true
    clean.challenges[challenge.id] = { attempts: entry.attempts, completed, points: completed ? scoreAnswer(entry.attempts) : 0 }
  }
  return clean
}

export function progressSummary(progress, challenges = []) {
  const clean = normaliseProgress(progress, challenges)
  const completed = challenges.filter(challenge => clean.challenges[challenge.id]?.completed).length
  const points = Object.values(clean.challenges).reduce((sum, entry) => sum + entry.points, 0)
  const next = challenges.findIndex(challenge => !clean.challenges[challenge.id]?.completed)
  return { completed, total: challenges.length, points, stars: completed, next: next === -1 ? challenges.length : next }
}

export function recordAnswer(progress, challenges, challengeId, choice) {
  const clean = normaliseProgress(progress, challenges)
  const challenge = challenges.find(item => item.id === challengeId)
  const summary = progressSummary(clean, challenges)
  if (!challenge || !Number.isInteger(choice) || choice < 0 || choice >= challenge.choices.length) return clean
  if (challenges[summary.next]?.id !== challengeId) return clean
  const attempts = Math.min(10000, (clean.challenges[challengeId]?.attempts || 0) + 1)
  const completed = choice === challenge.answer
  return { ...clean, challenges: { ...clean.challenges, [challengeId]: { attempts, completed, points: completed ? scoreAnswer(attempts) : 0 } } }
}

export function readProgress(storage, id, challenges) {
  return readProgressState(storage, id, challenges).progress
}

export function readProgressState(storage, id, challenges) {
  let raw
  try { raw = storage.getItem(progressKey(id)) } catch { return { progress: emptyProgress(), available: false } }
  try { return { progress: normaliseProgress(JSON.parse(raw), challenges), available: true } } catch { return { progress: emptyProgress(), available: true } }
}

export function writeProgress(storage, id, progress) {
  try { storage.setItem(progressKey(id), JSON.stringify(progress)); return true } catch { return false }
}

export function formatElapsed(seconds) {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`
}
