const base = { concept: 'differentiation', family: 'Rates of change & differentiation', accent: '#7c5cff' };
export const variants = [
  { ...base, id: 'differentiation-p', level: 'Primary', levelCode: 'P', topic: 'Speed', difficulty: 1, symbol: '🏎️', title: 'Race Pace: Speed from a Journey',
    objective: 'Find average speed as distance ÷ time, and see that a faster speed makes a steeper distance–time line.', syllabus: 'MOE Primary Mathematics (2021) P6 Speed', tags: ['speed', 'rate', 'distance-time'] },
  { ...base, id: 'differentiation-s', level: 'Secondary', levelCode: 'S', topic: 'Gradient of a curve', difficulty: 2, symbol: '📐', title: 'Tangent Tilt: Gradient of a Curve',
    objective: 'Estimate the gradient of a curve at a point by tilting a tangent line until it just touches the curve.', syllabus: 'MOE O-Level Mathematics 4052 (gradient of a curve) / Additional Mathematics 4049 (differentiation)', tags: ['gradient', 'tangent', 'curve'] },
  { ...base, id: 'differentiation-jc', level: 'JC', levelCode: 'JC', topic: 'Stationary points', difficulty: 2, symbol: '⛰️', title: 'Peak Finder: Stationary Points',
    objective: "Use f'(x) = 0 and the sign of f''(x) to locate and classify the stationary points of a cubic.", syllabus: 'SEAB H2 Mathematics 9758: Differentiation & applications (stationary points, nature)', tags: ['stationary point', 'maximum', 'minimum'] },
  { ...base, id: 'differentiation-poly', level: 'Poly', levelCode: 'Poly', topic: 'Numerical differentiation', difficulty: 2, symbol: '📡', title: 'Sensor Velocity: Rates from Data',
    objective: 'Estimate instantaneous velocity from sampled position data using the central difference.', syllabus: 'Poly engineering mathematics modules (institution-specific; example)', tags: ['central difference', 'velocity', 'data'] },
  { ...base, id: 'differentiation-u', level: 'University', levelCode: 'U', topic: 'First principles', difficulty: 3, symbol: '🔬', title: 'Limit Lab: Derivative from First Principles',
    objective: "Shrink h in the difference quotient [f(x+h) − f(x)]/h to find f'(x) as a limit, and see the error fall in proportion to h.", syllabus: 'University, Calculus', tags: ['limit', 'difference quotient', 'first principles'] },
];
