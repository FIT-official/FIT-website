// ChatGPT-generated single-file HTML sims (vetted with lib/sims/vetHtmlSim.js), one family per push.
// Each entry needs content/sims/html/<id>.html. Files live outside public/: they are only served
// through /simulations/<id>, under a CSP that blocks every external load and network call.
// Fields: id, title, level, subject, topic, concept, syllabusRef (University: generic label only),
// approach, activityPrompt, accent, symbol, minutes, tags, height (px, iframe), status ('live'|'draft').
const circuits = { subject: 'Physics', concept: 'circuits', accent: '#FFC83D', minutes: '10–15', status: 'live' }
export const htmlSims = [
  { ...circuits, id: 'circuits-p', title: 'Bulb Builder', level: 'Primary', topic: 'Electric circuits', symbol: '💡', height: 1000,
    syllabusRef: 'MOE Primary Science: Energy (electrical systems: closed circuits, conductors and insulators)',
    approach: 'Close the loop, use a switch and sort conductors from insulators so the bulb lights.',
    activityPrompt: 'Play all rounds, then explain why a bulb only lights when the circuit is a complete loop of conductors.', tags: ['circuits', 'conductors', 'insulators', 'switch'] },
  { ...circuits, id: 'circuits-s', title: 'Series or Parallel?', level: 'Secondary', topic: 'Series and parallel circuits', symbol: '🔋', height: 1400,
    syllabusRef: 'MOE Secondary Physics: Practical electricity and D.C. circuits (V = IR, series and parallel resistance, power)',
    approach: 'Choose resistors, layout and supply to hit a target current or power, using V = IR and the series/parallel rules.',
    activityPrompt: 'Play all rounds, then explain how adding a resistor in series and in parallel changes the total current.', tags: ['circuits', 'series', 'parallel', 'ohm’s law'] },
  { ...circuits, id: 'circuits-jc', title: 'Divider Detective', level: 'JC', topic: 'E.m.f., internal resistance and potential dividers', symbol: '🔍', height: 1210,
    syllabusRef: 'H2 Physics: D.C. circuits (e.m.f., internal resistance, potential dividers with LDRs and thermistors)',
    approach: 'Find a cell’s e.m.f. and internal resistance from V–I readings, then calibrate LDR and thermistor potential dividers.',
    activityPrompt: 'Play all rounds, then explain how the V–I graph gives E and r, and why a sensor divider output changes.', tags: ['circuits', 'emf', 'internal resistance', 'potential divider'] },
  { ...circuits, id: 'circuits-poly', title: 'Kirchhoff Junction', level: 'Poly', topic: 'Kirchhoff’s laws and Thévenin', symbol: '⚡', height: 1170,
    syllabusRef: 'Poly electrical engineering: circuit analysis (Kirchhoff’s laws, Thévenin equivalent, maximum power transfer) (generic)',
    approach: 'Set branch currents so KCL and both KVL loops balance, then find the Thévenin equivalent and match the load.',
    activityPrompt: 'Play all rounds, then explain how KCL and KVL pin down every branch current.', tags: ['circuits', 'kirchhoff', 'thevenin', 'maximum power'] },
  { ...circuits, id: 'circuits-u', title: 'RLC Tuner', level: 'University', topic: 'RLC transients and resonance', symbol: '📡', height: 1490,
    syllabusRef: 'University, Electromagnetism',
    approach: 'Tune R in a series RLC circuit for critical, under- and overdamped step responses, then hit a target resonance and Q.',
    activityPrompt: 'Play all rounds, then explain how R sets the damping regime and the Q factor of a series RLC circuit.', tags: ['University', 'Electromagnetism', 'RLC', 'resonance'] },
]
