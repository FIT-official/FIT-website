// Forces family: one engine, five level variants with distinct objectives.
const base = { concept: 'forces', family: 'Forces & motion', accent: '#3fb6a8' }
export const variants = [
  { ...base, id: 'forces-p', level: 'Primary', levelCode: 'P', topic: 'Forces', difficulty: 1, symbol: '📦', title: 'Tug Team: Balanced Forces',
    objective: 'Balance a push and a pull so a crate stays still, and see that unbalanced forces change motion.', syllabus: 'MOE Primary Science (2023) P5–P6 Interactions: Forces (push/pull, effects of forces)', tags: ['forces', 'push', 'pull', 'balanced'] },
  { ...base, id: 'forces-s', level: 'Secondary', levelCode: 'S', topic: 'Newton’s second law', difficulty: 2, symbol: '🛷', title: 'Sled Launch: F = ma',
    objective: 'Choose the applied force that gives a target acceleration once friction is taken into account (F_net = ma).', syllabus: 'MOE Upper Secondary Physics (2023) Dynamics: Newton’s laws, resultant force, friction', tags: ['newton', 'acceleration', 'friction', 'resultant force'] },
  { ...base, id: 'forces-jc', level: 'JC', levelCode: 'JC', topic: 'Forces on an incline', difficulty: 2, symbol: '⛷️', title: 'Slope Hauler: Inclined Planes',
    objective: 'Resolve weight into components and find the force along a rough slope for constant velocity.', syllabus: 'H2 Physics: Dynamics and forces (resolving forces, friction, equilibrium)', tags: ['incline', 'components', 'friction', 'equilibrium'] },
  { ...base, id: 'forces-poly', level: 'Poly', levelCode: 'Poly', topic: 'Statics: moments', difficulty: 2, symbol: '🏗️', title: 'Crane Balance: Moments',
    objective: 'Place a counterweight so the sum of moments about the pivot is zero.', syllabus: 'Poly engineering mechanics: statics, moments and equilibrium (generic)', tags: ['moments', 'statics', 'equilibrium', 'torque'] },
  { ...base, id: 'forces-u', level: 'University', levelCode: 'U', topic: 'Damped oscillations', difficulty: 3, symbol: '🌀', title: 'Shock Tuner: Critical Damping',
    objective: 'Tune the damping coefficient of a mass–spring–damper to critical damping, c = 2√(km), and compare the regimes.', syllabus: 'University, Mechanics', tags: ['damping', 'oscillator', 'ODE', 'mechanics'] },
]
