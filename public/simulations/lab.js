import { findActivity } from './catalog.js';
import { samplingModel, signalValue, inspectionModel, inspectionSample, feedbackModel, createHeatGrid, heatStep, heatMetrics, HEAT_WIDTH } from './models.js';
import { heatColor, heatLegendGradient } from './visuals.js';

const id = document.body.dataset.activity;
const activity = findActivity(id);
if (!activity) throw new Error('Unknown FIT simulation');
const $ = selector => document.querySelector(selector);
const format = (value, digits = 1) => Number.isFinite(value) ? value.toLocaleString('en', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—';
document.documentElement.style.setProperty('--accent', activity.accent);
document.title = `${activity.title} | FIT`;
if (new URLSearchParams(location.search).get('embed') === '1') document.body.classList.add('embed');

const defaults = {
  sampling: { frequency: 7, sampleRate: 10, phase: 0, amplitude: 1, duration: 2, revealSource: false, revealFold: false },
  feedback: { target: 60, ambient: 20, kp: 0.06, ki: 0.002, delay: 0, loss: 4, maxPower: 240, capacity: 200, mode: 'PI', manual: 0.5, disturbance: false },
  'base-rates': { prevalence: 1, sensitivity: 95, specificity: 95, population: 10000, mode: 'Expected', seed: 42 },
  'heat-path': { brush: 1, fixedEdges: true, selectedRow: 7, selectedColumn: 13 },
};
let state = { ...defaults[id] }, grid = createHeatGrid(), elapsed = 0, playing = false, frame = 0, lastTime = 0, budget = 0;
let thermal, inspection, heatHistory = [{ t: 0, ...heatMetrics(grid) }];

$('#app').innerHTML = `
  <div class="wrap">
    <header class="top"><a class="brand" href="/class/simulations">FIT / EXPLORE</a><span class="badge">Original FIT activity</span></header>
    <div class="intro"><div class="eyebrow">${activity.subjects.join(' · ')} / ${activity.level}</div><h1>${activity.title}</h1><p>${activity.description}</p></div>
    <main class="workbench"><section class="panel"><div class="eyebrow">Observe & experiment</div><h2 id="work-title">${activity.question}</h2>
      <div id="toolbar" class="toolbar"></div><div id="visual"></div><div id="metrics" class="metric-grid"></div><div id="status" class="status"></div><div id="data"></div>
    </section><aside id="controls" class="panel controls" aria-label="Simulation controls"></aside></main>
    <details><summary>Equations, units & model limits</summary><p class="model">${activity.model}</p><p id="model-extra"></p></details>
    <details class="teacher"><summary>Teacher prompts & expected observations</summary><p>${activity.teacher}</p><p>Suggested age ${activity.ages}; ${activity.minutes} minutes.</p></details>
    <footer class="footer">Original FIT simulations. <a href="/class/simulations">Explore all activities</a></footer>
    <div id="announcement" class="sr-only" aria-live="polite"></div>
  </div>`;

function range(key, label, min, max, step, unit = '') {
  return `<div class="control"><label for="${key}">${label}<span>${unit}</span></label><input id="${key}" data-key="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${state[key]}" aria-label="${label} (${unit || 'value'})"><input id="${key}-number" data-key="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${state[key]}" aria-label="${label}, numeric value (${unit || 'value'})"></div>`;
}
function select(key, label, options) {
  return `<div class="control select-control"><label for="${key}">${label}</label><select id="${key}" data-key="${key}">${options.map(([value, text]) => `<option value="${value}" ${String(state[key]) === String(value) ? 'selected' : ''}>${text}</option>`).join('')}</select></div>`;
}
function check(key, label) { return `<label class="check wide"><input type="checkbox" data-key="${key}" ${state[key] ? 'checked' : ''}>${label}</label>`; }

function controls() {
  let html = '<h2>Adjust the model</h2>';
  if (id === 'sampling') html += range('frequency', 'Source frequency', 0, 12, 0.5, 'Hz') + range('sampleRate', 'Sampling rate', 1, 40, 1, 'samples/s') + range('phase', 'Phase', 0, 360, 15, '°') + range('amplitude', 'Amplitude', 0, 2, 0.1, 'V') + range('duration', 'Observation window', 1, 4, 1, 's') + check('revealFold', 'Reveal compatible wave') + check('revealSource', 'Reveal source wave');
  if (id === 'feedback') html += select('mode', 'Controller', ['Manual', 'P', 'PI'].map(x => [x, x])) + range('target', 'Target temperature', 25, 90, 1, '°C') + range('kp', 'Proportional gain Kp', 0, 0.3, 0.01, '1/°C') + range('ki', 'Integral gain Ki (PI)', 0, 0.01, 0.0005, '1/(°C·s)') + range('delay', 'Sensor delay', 0, 30, 1, 's') + range('ambient', 'Outside temperature', 0, 30, 1, '°C') + range('loss', 'Heat loss G', 1, 8, 0.5, 'W/K') + range('capacity', 'Thermal capacity C', 100, 500, 50, 'J/K') + range('maxPower', 'Heater limit', 100, 400, 20, 'W') + range('manual', 'Manual heater duty', 0, 1, 0.05, 'fraction') + check('disturbance', 'Cold air at 150 s (−10 °C)');
  if (id === 'base-rates') html += range('prevalence', 'Defect rate', 0, 100, 0.1, '%') + range('sensitivity', 'Sensitivity: catch defects', 0, 100, 1, '%') + range('specificity', 'Specificity: clear sound parts', 0, 100, 1, '%') + select('population', 'Batch size', [[100, '100'], [1000, '1,000'], [10000, '10,000']]) + select('mode', 'Counts', [['Expected', 'Expected frequencies'], ['Sample', 'Seeded finite sample']]) + range('seed', 'Sample seed', 1, 9999, 1, 'integer') + '<p class="quiet wide">The false-alarm rate is 100% minus specificity. Expected counts may be fractional; sampled counts are integers.</p>';
  if (id === 'heat-path') html += select('brush', 'Paint material (conductance)', [[1, 'High · 1 W/K'], [0.2, 'Medium · 0.2 W/K'], [0.02, 'Low · 0.02 W/K'], [0, 'Insulator × · 0 W/K']]) + check('fixedEdges', 'Hold edges at 100 °C / 20 °C') + select('selectedRow', 'Selected tile row', Array.from({ length: 12 }, (_, i) => [i + 1, String(i + 1)])) + select('selectedColumn', 'Selected tile column', Array.from({ length: 16 }, (_, i) => [i + 1, String(i + 1)])) + '<button id="paint-selected" class="button wide">Paint selected tile</button><p class="quiet wide">Use row/column controls for precise touch painting, or click a tile. Keyboard: Tab enters the grid, arrows move, Space/Enter paints. Edge reservoirs cannot be painted while fixed. Painting pauses the model and keeps current temperatures. Reset starts a fresh comparison.</p>';
  $('#controls').innerHTML = html;
  $('#controls').oninput = event => {
    const input = event.target, key = input.dataset.key;
    if (!key) return;
    if (input.type === 'number' && input.value === '') return;
    const numeric = typeof defaults[id][key] === 'number';
    let value = input.type === 'checkbox' ? input.checked : numeric ? Number(input.value) : input.value;
    if (numeric) {
      if (!Number.isFinite(value)) return;
      if (input.min !== '' && input.min != null) value = Math.max(Number(input.min), value);
      if (input.max !== '' && input.max != null) value = Math.min(Number(input.max), value);
      if (input.step && input.step !== 'any') value = Number((Math.round(value / Number(input.step)) * Number(input.step)).toFixed(6));
    }
    state[key] = value;
    document.querySelectorAll(`[data-key="${key}"]`).forEach(other => { if (other !== input) other.value = value; });
    pause();
    if (id === 'heat-path') { if (key === 'fixedEdges') resetHeat(); } else elapsed = 0;
    compute(); render();
  };
  $('#controls').onchange = event => {
    if (event.target.type === 'number') event.target.value = state[event.target.dataset.key];
  };
  if (id === 'heat-path') $('#paint-selected').onclick = () => {
    const index = (state.selectedRow - 1) * HEAT_WIDTH + state.selectedColumn - 1;
    pause(); paintHeatCell(index); render();
    $('#announcement').textContent = state.fixedEdges && (index % 16 === 0 || index % 16 === 15) ? 'Fixed edge reservoirs cannot be painted.' : `Painted row ${state.selectedRow}, column ${state.selectedColumn}.`;
  };
}

function compute() {
  if (id === 'feedback') thermal = feedbackModel(state);
  if (id === 'base-rates') inspection = (state.mode === 'Sample' ? inspectionSample : inspectionModel)({ ...state, prevalence: state.prevalence / 100, sensitivity: state.sensitivity / 100, specificity: state.specificity / 100 });
}
function metric(label, value) { return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`; }
function path(points, x, y) { return points.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(2)},${y(p).toFixed(2)}`).join(' '); }
let chartWidth = 0;
function availableChartWidth() { return $('#visual').clientWidth > 2 ? $('#visual').clientWidth - 2 : 620; }
function chart({ series, points = [], maxX = 2, minY = -2.2, maxY = 2.2, xLabel = 'Time (s)', yLabel = 'Voltage (V)', label }) {
  // Match SVG units to its rendered width, including inside the class iframe.
  // Fixed 12-unit text then remains 12 CSS pixels instead of shrinking with a desktop viewBox.
  const width = availableChartWidth(), height = Math.max(252, Math.min(330, width * 292 / 620));
  chartWidth = width;
  const left = 48, right = width - 24, top = 32, bottom = height - 48;
  const x = p => left + p.t / maxX * (right - left), y = p => bottom - (p.y - minY) / (maxY - minY) * (bottom - top);
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}"><title>${label}</title><rect width="${width}" height="${height}" fill="#f5f8f7"/>${Array.from({ length: 5 }, (_, i) => { const v = minY + (maxY - minY) * i / 4, yy = y({ y: v }); return `<line x1="${left}" y1="${yy}" x2="${right}" y2="${yy}" stroke="#d9e2e1"/><text x="${left - 8}" y="${yy + 4}" text-anchor="end" font-size="12" fill="#586970">${format(v, 1)}</text>`; }).join('')}${Array.from({ length: 5 }, (_, i) => `<text x="${x({ t: maxX * i / 4 })}" y="${bottom + 20}" text-anchor="middle" font-size="12" fill="#586970">${format(maxX * i / 4, 1)}</text>`).join('')}<text x="${(left + right) / 2}" y="${height - 8}" text-anchor="middle" font-size="12" fill="#18272b">${xLabel}</text><text x="10" y="18" font-size="12" fill="#18272b">${yLabel}</text>${series.map(s => `<path d="${path(s.values, x, y)}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2.5}" ${s.dashed ? 'stroke-dasharray="7 5"' : ''}/>`).join('')}${points.map(p => `<circle cx="${x(p)}" cy="${y(p)}" r="3.4" fill="#18272b" stroke="#fff" stroke-width="1"/>`).join('')}</svg>`;
}

function renderSampling() {
  const phase = state.phase * Math.PI / 180;
  const model = samplingModel({ ...state, phase });
  const curve = f => Array.from({ length: 801 }, (_, i) => ({ t: i * state.duration / 800, y: signalValue(i * state.duration / 800, f, phase, state.amplitude) }));
  const series = [];
  if (state.revealSource) series.push({ values: curve(state.frequency), color: '#5361d8' });
  if (state.revealFold) series.push({ values: curve(model.alias), color: '#b45b20', dashed: true });
  $('#visual').innerHTML = `<figure class="stage">${chart({ series, points: model.samples, maxX: state.duration, label: 'Sensor samples with optional source and compatible waves' })}<figcaption>Dots are measurements. Solid blue: source (when revealed). Dashed orange: lowest-band compatible sine.</figcaption></figure>`;
  $('#metrics').innerHTML = metric('Measurements incl. endpoints', model.samples.length) + metric('Folded frequency (signed)', state.revealFold ? `${format(model.alias)} Hz` : 'Reveal wave') + metric('Sample agreement error', state.revealFold ? `${model.residual.toExponential(1)} V` : 'Reveal wave');
  const equality = state.sampleRate === 2 * state.frequency;
  $('#status').textContent = !state.revealSource ? 'Make a prediction before revealing the source. Many continuous waves can agree with a finite set of dots.' : equality ? 'Nyquist equality: samples can be phase-degenerate. Use a rate strictly greater than twice the source frequency.' : model.resolvable ? 'The sampling rate exceeds twice this source frequency. Unique recovery still requires a known band limit.' : 'Aliasing: this sampling rate does not meet the strict Nyquist condition for this source.';
  $('#data').innerHTML = `<details><summary>Sample measurements (${model.samples.length} rows)</summary><div class="table-wrap"><table><caption>Every sensor reading, in volts</caption><thead><tr><th scope="col">Time (s)</th><th scope="col">Sensor (V)</th><th scope="col">Compatible (V)</th></tr></thead><tbody>${model.samples.map(p => `<tr><td>${format(p.t, 3)}</td><td>${format(p.y, 3)}</td><td>${state.revealFold ? format(signalValue(p.t, model.alias, phase, state.amplitude), 3) : 'Hidden'}</td></tr>`).join('')}</tbody></table></div></details>`;
  $('#model-extra').textContent = `Sample rate: ${state.sampleRate} samples/s; Nyquist edge: ${format(state.sampleRate / 2)} Hz. The observation includes both endpoints; an N-interval budget therefore uses N+1 displayed measurements.`;
}

function renderFeedback() {
  const visible = thermal.points.filter(p => p.t <= elapsed);
  const current = visible.at(-1) || thermal.points[0];
  const upper = Math.max(state.target + 15, state.ambient + 20, ...thermal.points.map(p => p.temperature + 5));
  $('#visual').innerHTML = `<figure class="stage">${chart({ series: [{ values: [{ t: 0, y: state.target }, { t: 300, y: state.target }], color: '#768b88', dashed: true }, { values: visible.map(p => ({ t: p.t, y: p.temperature })), color: '#bc6529' }, { values: visible.map(p => ({ t: p.t, y: p.sensed })), color: '#5361d8', dashed: true }], maxX: 300, minY: Math.min(0, state.ambient - 10), maxY: upper, yLabel: 'Temperature (°C)', label: 'Actual orange and delayed sensed blue temperatures; grey dashed target' })}<figcaption>Solid orange: actual. Dashed blue: sensed. Dashed grey: target. Fixed numerical step: 0.1 s. Playback advances 20 model seconds per real second.</figcaption></figure>`;
  $('#metrics').innerHTML = metric('Elapsed model time', `${format(elapsed, 0)} s`) + metric('Actual temperature', `${format(current.temperature)} °C`) + metric('Heater power', `${format(current.power, 0)} W`) + metric('Energy used so far', `${format(current.energy / 1000, 2)} kJ`) + metric('Time within ±2 °C', `${format(current.bandTime, 0)} s`) + metric('Full-run overshoot', `${format(thermal.overshoot)} °C`);
  $('#status').textContent = state.target >= thermal.equilibriumLimit ? `Target at/above heater limit: ${format(thermal.equilibriumLimit)} °C under final outside conditions. Gain cannot create more heater power. Full-run final: ${format(thermal.final)} °C.` : `Full 300 s forecast: ${format(thermal.final)} °C; final error ${format(state.target - thermal.final)} °C. Compare energy use and overshoot before choosing gains.`;
  $('#data').innerHTML = `<details><summary>Full-run measurements & energy balance</summary><p>Heater input ${format(thermal.energy / 1000, 3)} kJ = stored change ${format(thermal.storedEnergy / 1000, 3)} kJ + heat loss ${format(thermal.lossEnergy / 1000, 3)} kJ.</p><div class="table-wrap"><table><caption>Selected readings from the 300 s forecast</caption><thead><tr><th scope="col">Time (s)</th><th scope="col">Actual (°C)</th><th scope="col">Sensed (°C)</th><th scope="col">Power (W)</th></tr></thead><tbody>${thermal.points.filter((p, i) => i % 30 === 0).map(p => `<tr><td>${p.t}</td><td>${format(p.temperature)}</td><td>${format(p.sensed)}</td><td>${format(p.power)}</td></tr>`).join('')}</tbody></table></div></details>`;
  $('#model-extra').textContent = 'Manual duty is used only in Manual mode; Ki is used only in PI mode. Changing any setting pauses and restarts the predicted experiment. Overshoot is maximum actual temperature above target across the full run; band time counts steps within ±2 °C.';
}

function renderInspection() {
  const p = inspection.posterior;
  $('#visual').innerHTML = `<div class="count-row"><div class="count"><span>True flags / defective</span><strong>${format(inspection.tp, state.mode === 'Sample' ? 0 : 1)}</strong><span>Caught defects</span></div><div class="count false"><span>False flags / sound</span><strong>${format(inspection.fp, state.mode === 'Sample' ? 0 : 1)}</strong><span>False alarms</span></div></div><h3>Among flagged components</h3><div class="probability-bar" role="img" aria-label="${p == null ? 'No positive results' : `${format(100 * p)} percent of flagged parts are defective`}"><div style="width:${p == null ? 0 : 100 * p}%"></div></div><p class="quiet">Green = defective; orange = sound. Exact counts appear below.</p>`;
  $('#metrics').innerHTML = metric('Defective given a flag', p == null ? 'Undefined' : `${format(100 * p, 2)}%`) + metric('Missed defects', format(inspection.fn, state.mode === 'Sample' ? 0 : 1)) + metric('Flagged beyond 100 checks', format(Math.max(0, inspection.positive - 100), state.mode === 'Sample' ? 0 : 1));
  $('#status').textContent = p == null ? 'Undefined: this batch/model has no positive results, so P(defect | flag) has a zero denominator.' : `The inspector catches ${state.sensitivity}% of defects. In this ${state.mode === 'Sample' ? 'seeded batch' : 'expected batch'}, ${format(100 * p, 2)}% of flagged components are defective. Those are different conditional probabilities.`;
  const rows = [['Defective', inspection.tp, inspection.fn], ['Sound', inspection.fp, inspection.tn], ['Total', inspection.positive, inspection.negative]];
  $('#data').innerHTML = `<div class="table-wrap"><table><caption>${state.mode === 'Sample' ? `Synthetic sampled counts · seed ${state.seed}` : 'Expected natural frequencies (fractional counts allowed)'}</caption><thead><tr><th scope="col">True state</th><th scope="col">Flagged</th><th scope="col">Cleared</th><th scope="col">Total</th></tr></thead><tbody>${rows.map(([name, a, b]) => `<tr><th scope="row">${name}</th><td>${format(a, state.mode === 'Sample' ? 0 : 1)}</td><td>${format(b, state.mode === 'Sample' ? 0 : 1)}</td><td>${format(a + b, state.mode === 'Sample' ? 0 : 1)}</td></tr>`).join('')}</tbody></table></div>`;
  $('#model-extra').textContent = 'Population values are synthetic. The same seed and settings repeat exactly. Finite samples need not equal expected frequencies. A second-inspection budget is a counting exercise; second-test results are not simulated.';
}

let focusCell = 0;
function paintHeatCell(index) {
  focusCell = index;
  state.selectedRow = Math.floor(index / HEAT_WIDTH) + 1;
  state.selectedColumn = index % HEAT_WIDTH + 1;
  $('#selectedRow').value = state.selectedRow;
  $('#selectedColumn').value = state.selectedColumn;
  if (!(state.fixedEdges && (index % 16 === 0 || index % 16 === 15))) grid[index].material = state.brush;
}
function renderHeat() {
  const metrics = heatMetrics(grid);
  const initialMean = createHeatGrid().reduce((sum, c) => sum + c.temperature, 0) / grid.length;
  $('#visual').innerHTML = `<div class="stage"><div class="heat-grid" role="group" aria-label="Heat plate: arrow keys move, Space or Enter paints">${grid.map((cell, i) => { const edge = i % 16 === 0 || i % 16 === 15, probe = i === 6 * 16 + 12 ? 'A' : i === 3 * 16 + 8 ? 'B' : ''; return `<button class="heat-cell ${cell.material === 0 ? 'insulator' : cell.material === .02 ? 'low' : cell.material === .2 ? 'mid' : ''}" data-cell="${i}" ${probe ? `data-probe="${probe}"` : ''} tabindex="${i === focusCell ? 0 : -1}" style="background:${cell.material === 0 ? '#34494f' : heatColor(cell.temperature)}" aria-label="Row ${Math.floor(i / HEAT_WIDTH) + 1}, column ${i % HEAT_WIDTH + 1}: ${format(cell.temperature)} degrees Celsius, conductance ${cell.material}${probe ? `, probe ${probe}` : ''}${edge && state.fixedEdges ? ', fixed reservoir' : ''}"></button>`; }).join('')}</div></div><div class="scale" style="background:${heatLegendGradient()}" aria-hidden="true"></div><div class="scale-label"><span>20 °C / cold</span><span>60 °C</span><span>100 °C / hot</span></div><p class="quiet">A = target (row 7, column 13). B = protected (row 4, column 9). Material markings: × insulator, · low, + medium, plain high. Fixed scale.</p>`;
  $('#metrics').innerHTML = metric('Elapsed model time', `${format(elapsed)} s`) + metric('Target A', `${format(metrics.probe)} °C`) + metric('Protected B', `${format(metrics.protectedProbe)} °C`) + metric('Plate mean', `${format(metrics.mean, 2)} °C`) + metric('Stored-energy change', `${format((metrics.mean - initialMean) * grid.length, 2)} J`) + metric('Boundary mode', state.fixedEdges ? 'Reservoirs' : 'Insulated');
  $('#status').textContent = state.fixedEdges ? 'The edge reservoirs supply and remove energy. Design a conducting path to A while protecting B, then compare at equal elapsed times.' : 'All outside boundaries are insulated. With no source, total energy and mean temperature are conserved even as heat redistributes.';
  $('#data').innerHTML = `<details><summary>Probe measurements</summary><div class="table-wrap"><table><caption>Probe log (up to 300 model seconds)</caption><thead><tr><th scope="col">Time (s)</th><th scope="col">A (°C)</th><th scope="col">B (°C)</th><th scope="col">Mean (°C)</th></tr></thead><tbody>${heatHistory.filter((p, i) => i % 10 === 0 || i === heatHistory.length - 1).map(p => `<tr><td>${format(p.t)}</td><td>${format(p.probe)}</td><td>${format(p.protectedProbe)}</td><td>${format(p.mean, 2)}</td></tr>`).join('')}</tbody></table></div></details>`;
  $('#model-extra').textContent = 'Temperature differences in °C equal differences in K. Each cell has 1 J/K capacity; conductance is 0–1 W/K. Symmetric face fluxes use harmonic means. Each internal transfer subtracts and adds the same energy. With reservoirs, the net energy change comes from the boundaries.';
  const plate = $('.heat-grid');
  plate.onclick = event => {
    const cell = event.target.closest('[data-cell]'); if (!cell) return;
    pause(); paintHeatCell(Number(cell.dataset.cell));
    renderHeat(); $(`[data-cell="${focusCell}"]`).focus();
  };
  plate.onkeydown = event => {
    const cell = event.target.closest('[data-cell]'); if (!cell) return;
    const i = Number(cell.dataset.cell), moves = { ArrowRight: i % 16 < 15 ? i + 1 : i, ArrowLeft: i % 16 > 0 ? i - 1 : i, ArrowDown: Math.min(grid.length - 1, i + 16), ArrowUp: Math.max(0, i - 16) };
    if (event.key in moves) { event.preventDefault(); pause(); renderToolbar(); cell.tabIndex = -1; focusCell = moves[event.key]; state.selectedRow = Math.floor(focusCell / 16) + 1; state.selectedColumn = focusCell % 16 + 1; $('#selectedRow').value = state.selectedRow; $('#selectedColumn').value = state.selectedColumn; const next = $(`[data-cell="${focusCell}"]`); next.tabIndex = 0; next.focus(); }
  };
}

function renderToolbar() {
  const dynamic = id === 'feedback' || id === 'heat-path';
  $('#toolbar').innerHTML = `${dynamic ? `<button id="play" class="button primary" aria-pressed="${playing}">${playing ? 'Pause' : 'Run'}</button><button id="step" class="button">Step ${id === 'feedback' ? '1' : '0.2'} s</button><button id="finish" class="button">Advance to 300 s</button>` : ''}<button id="reset" class="button">Reset</button>`;
  $('#reset').onclick = () => { pause(); state = { ...defaults[id] }; elapsed = 0; resetHeat(); controls(); compute(); render(); $('#announcement').textContent = 'Simulation reset to initial settings.'; $('#reset').focus(); };
  if (dynamic) {
    $('#play').onclick = () => { if (playing) pause(); else { if (elapsed >= 300) { elapsed = 0; if (id === 'heat-path') resetHeat(); } playing = true; lastTime = 0; budget = 0; frame = requestAnimationFrame(tick); } renderToolbar(); $('#play').focus(); };
    $('#step').onclick = () => { pause(); advance(id === 'feedback' ? 1 : .2); render(); $('#step').focus(); };
    $('#finish').onclick = () => { pause(); advance(300 - elapsed); render(); $('#finish').focus(); $('#announcement').textContent = 'Experiment advanced to 300 model seconds.'; };
  }
}
function resetHeat() { grid = createHeatGrid(); elapsed = 0; heatHistory = [{ t: 0, ...heatMetrics(grid) }]; }
function pause() { playing = false; cancelAnimationFrame(frame); }
function advance(seconds) {
  if (id === 'feedback') elapsed = Math.min(300, elapsed + seconds);
  if (id === 'heat-path') {
    const steps = Math.min(Math.round(seconds / .2), Math.round((300 - elapsed) / .2));
    for (let i = 0; i < steps; i++) { grid = heatStep(grid, state); elapsed = Number((elapsed + .2).toFixed(6)); if (Math.round(elapsed * 5) % 5 === 0) heatHistory.push({ t: elapsed, ...heatMetrics(grid) }); }
  }
}
function tick(time) {
  if (!playing) return;
  if (!lastTime) lastTime = time;
  budget += Math.min(100, time - lastTime) / 1000 * (id === 'feedback' ? 20 : 5);
  lastTime = time;
  if (budget >= .2) { const amount = Math.floor(budget / .2) * .2; advance(amount); budget -= amount; id === 'feedback' ? renderFeedback() : renderHeat(); }
  if (elapsed >= 300) { pause(); renderToolbar(); $('#announcement').textContent = 'Experiment reached 300 model seconds.'; } else frame = requestAnimationFrame(tick);
}
function render() { renderToolbar(); ({ sampling: renderSampling, feedback: renderFeedback, 'base-rates': renderInspection, 'heat-path': renderHeat })[id](); }
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); renderToolbar(); } });
if ('IntersectionObserver' in window) new IntersectionObserver(entries => { if (!entries[0].isIntersecting && playing) { pause(); renderToolbar(); } }, { threshold: 0 }).observe($('.workbench'));
controls(); compute(); render();
if ((id === 'sampling' || id === 'feedback') && 'ResizeObserver' in window) {
  new ResizeObserver(() => {
    if (availableChartWidth() !== chartWidth) (id === 'sampling' ? renderSampling : renderFeedback)();
  }).observe($('#visual'));
}
