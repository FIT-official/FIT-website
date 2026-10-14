// Original FIT teaching models. SI units unless a control explicitly says otherwise.
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function signalValue(t, frequency, phase = 0, amplitude = 1) {
  if (amplitude === 0) return 0;
  return amplitude * Math.sin(2 * Math.PI * frequency * t + phase);
}

export function signedAlias(frequency, sampleRate) {
  return frequency - Math.round(frequency / sampleRate) * sampleRate;
}

export function samplingModel({ frequency = 7, sampleRate = 10, phase = 0, amplitude = 1, duration = 2 } = {}) {
  const alias = signedAlias(frequency, sampleRate);
  const samples = Array.from({ length: Math.floor(duration * sampleRate) + 1 }, (_, i) => {
    const t = i / sampleRate;
    return { t, y: signalValue(t, frequency, phase, amplitude) };
  });
  const residual = Math.max(...samples.map(({ t, y }) => Math.abs(y - signalValue(t, alias, phase, amplitude))));
  return { alias, samples, residual, resolvable: sampleRate > 2 * frequency };
}

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function inspectionSample({ prevalence = 0.01, sensitivity = 0.95, specificity = 0.95, population = 10000, seed = 42 } = {}) {
  const random = seededRandom(seed);
  const counts = { tp: 0, fn: 0, tn: 0, fp: 0 };
  for (let i = 0; i < population; i++) {
    const defective = random() < prevalence;
    const positive = random() < (defective ? sensitivity : 1 - specificity);
    counts[defective ? positive ? 'tp' : 'fn' : positive ? 'fp' : 'tn']++;
  }
  const positive = counts.tp + counts.fp, negative = counts.tn + counts.fn;
  return { ...counts, positive, negative, posterior: positive > 0 ? counts.tp / positive : null,
    negativePosterior: negative > 0 ? counts.fn / negative : null };
}

// Expected counts in a synthetic population; fractional counts remain visible.
export function inspectionModel({ prevalence = 0.01, sensitivity = 0.95, specificity = 0.95, population = 10000 } = {}) {
  const defective = population * prevalence;
  const sound = population - defective;
  const tp = defective * sensitivity;
  const fn = defective - tp;
  const tn = sound * specificity;
  const fp = sound - tn;
  return { tp, fn, tn, fp, positive: tp + fp, negative: tn + fn,
    posterior: tp + fp > 0 ? tp / (tp + fp) : null,
    negativePosterior: tn + fn > 0 ? fn / (tn + fn) : null };
}

// Lumped thermal plant: C dT/dt = Pmax*u - k(T-Tambient).
// Discrete controller with delayed sensing and conditional-integration anti-windup.
export function feedbackModel({ target = 60, kp = 0.06, ki = 0.002, delay = 0, loss = 4, maxPower = 240, duration = 300, dt = 0.1, ambient = 20, capacity = 200, mode = 'PI', manual = 0.5, disturbance = false, initial = ambient } = {}) {
  if (!(dt > 0 && dt <= 0.5 && capacity > 0 && loss >= 0 && duration > 0 && duration <= 2000)) throw new RangeError('Invalid thermal integration settings');
  let temperature = initial, integral = 0, maximum = initial, energy = 0, lossEnergy = 0, bandTime = 0;
  const temperatures = [temperature], points = [{ t: 0, temperature, sensed: temperature, power: 0, energy: 0, bandTime: 0 }];
  const delaySteps = Math.round(delay / dt);
  const count = Math.round(duration / dt);
  for (let n = 0; n < count; n++) {
    const measured = temperatures[Math.max(0, n - delaySteps)];
    const error = target - measured;
    const proposed = integral + error * dt;
    const integralGain = mode === 'PI' ? ki : 0;
    const proposedOutput = kp * error + integralGain * proposed;
    if ((proposedOutput >= 0 && proposedOutput <= 1) || (proposedOutput > 1 && error < 0) || (proposedOutput < 0 && error > 0)) integral = proposed;
    const u = mode === 'Manual' ? clamp(manual, 0, 1) : clamp(kp * error + integralGain * integral, 0, 1);
    const outside = ambient - (disturbance && n * dt >= 150 ? 10 : 0);
    const lostPower = loss * (temperature - outside);
    energy += dt * maxPower * u;
    lossEnergy += dt * lostPower;
    temperature += dt * (maxPower * u - lostPower) / capacity;
    if (Math.abs(temperature - target) <= 2) bandTime += dt;
    maximum = Math.max(maximum, temperature);
    temperatures.push(temperature);
    if ((n + 1) % Math.round(1 / dt) === 0 || n === count - 1) points.push({ t: (n + 1) * dt, temperature, sensed: measured, power: maxPower * u, energy, bandTime });
  }
  return { points, final: temperature, overshoot: Math.max(0, maximum - target), equilibriumLimit: loss > 0 ? ambient - (disturbance ? 10 : 0) + maxPower / loss : Infinity, capacity, ambient, energy, lossEnergy, bandTime, storedEnergy: capacity * (temperature - initial) };
}

export const HEAT_WIDTH = 16, HEAT_HEIGHT = 12;
export function createHeatGrid() {
  return Array.from({ length: HEAT_WIDTH * HEAT_HEIGHT }, (_, i) => ({
    temperature: i % HEAT_WIDTH === 0 ? 100 : i % HEAT_WIDTH === HEAT_WIDTH - 1 ? 20 : 20,
    material: 1,
  }));
}

export function heatStep(grid, { dt = 0.2, fixedEdges = true } = {}) {
  if (!(dt > 0 && dt <= 0.25) || grid.length !== HEAT_WIDTH * HEAT_HEIGHT || grid.some(cell => cell.material < 0 || cell.material > 1 || !Number.isFinite(cell.temperature))) throw new RangeError('Heat grid exceeds the stable model bounds');
  const delta = new Float64Array(grid.length);
  // Each edge transfers equal and opposite energy; no independent cell clamping.
  for (let i = 0; i < grid.length; i++) {
    for (const j of [i % HEAT_WIDTH < HEAT_WIDTH - 1 ? i + 1 : -1, i + HEAT_WIDTH < grid.length ? i + HEAT_WIDTH : -1]) {
      if (j < 0) continue;
      const a = grid[i].material, b = grid[j].material;
      const conductance = a + b > 0 ? 2 * a * b / (a + b) : 0;
      const flux = dt * conductance * (grid[j].temperature - grid[i].temperature);
      delta[i] += flux;
      delta[j] -= flux;
    }
  }
  return grid.map((cell, i) => ({ ...cell, temperature: fixedEdges && i % HEAT_WIDTH === 0 ? 100 : fixedEdges && i % HEAT_WIDTH === HEAT_WIDTH - 1 ? 20 : cell.temperature + delta[i] }));
}

export function heatMetrics(grid) {
  const probe = grid[6 * HEAT_WIDTH + 12].temperature;
  return { probe, protectedProbe: grid[3 * HEAT_WIDTH + 8].temperature, mean: grid.reduce((sum, cell) => sum + cell.temperature, 0) / grid.length };
}
