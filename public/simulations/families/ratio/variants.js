// Ratio family: one engine, five level variants with distinct objectives.
const base = { concept: 'ratio', family: 'Ratio & proportion', accent: '#ff7a59' };
export const variants = [
  { ...base, id: 'ratio-p', level: 'Primary', levelCode: 'P', topic: 'Ratio', difficulty: 1, symbol: '🎨', title: 'Paint Mixer: Ratio Match',
    objective: 'Make a paint mix in a given ratio, using equivalent ratios to scale it up.', syllabus: 'MOE Primary Mathematics (2021) P5–P6 Ratio: equivalent ratios, simplest form', tags: ['ratio', 'equivalent ratio', 'mixing'] },
  { ...base, id: 'ratio-s', level: 'Secondary', levelCode: 'S', topic: 'Direct proportion', difficulty: 1, symbol: '🧁', title: 'Recipe Scaler: Direct Proportion',
    objective: 'Use y = kx to scale quantities and read the constant k as the gradient of a line through the origin.', syllabus: 'MOE O-Level Mathematics 4052: Ratio & proportion, direct proportion', tags: ['direct proportion', 'unit rate', 'graph'] },
  { ...base, id: 'ratio-jc', level: 'JC', levelCode: 'JC', topic: 'Mole ratio & limiting reagent', difficulty: 2, symbol: '⚗️', title: 'Reactor Balance: Mole Ratios',
    objective: 'Use the stoichiometric mole ratio to find the exact amount of a reactant for complete reaction and identify the limiting reagent.', syllabus: 'SEAB H2 Chemistry 9476: The Mole Concept & Stoichiometry', tags: ['stoichiometry', 'mole ratio', 'chemistry'] },
  { ...base, id: 'ratio-poly', level: 'Poly', levelCode: 'Poly', topic: 'Gear ratios', difficulty: 2, symbol: '⚙️', title: 'Gearbox Tuner: Speed & Torque',
    objective: 'Choose gear teeth so a gear ratio delivers a target output speed, and explain the speed–torque trade-off.', syllabus: 'Poly engineering mechanics / mechanisms modules (institution-specific; example)', tags: ['gear ratio', 'torque', 'mechanisms'] },
  { ...base, id: 'ratio-u', level: 'University', levelCode: 'U', topic: 'Scaling laws', difficulty: 3, symbol: '📈', title: 'Scaling Law Hunter: Log–Log Fits',
    objective: 'Fit a power law y = kxⁿ to data on log–log axes and interpret the exponent n as a scaling ratio.', syllabus: 'University, Modelling', tags: ['power law', 'log-log', 'scaling'] },
];
