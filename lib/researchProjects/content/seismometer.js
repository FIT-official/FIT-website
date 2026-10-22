import 'server-only'
import { tex, mcq, short, derive, reflect, item, column } from './builders.js'

// Project 08, adapted from the independent content owner's supplied guide (22 October 2026).
// Numerical examples are SYNTHETIC. This is not a claim that FIT built the ETH/HES-SO or TC1 instruments.

const project = {
  slug: 'seismometer-calibrated-vibration-sensor',
  simId: 'seismometer',
  title: 'Build a calibrated vibration sensor',
  shortTitle: 'Calibrated vibration sensor',
  field: 'Mechanics, waves and signal processing',
  level: 'Advanced Secondary 3 to 4 with scaffolding; Secondary 4 or JC for differential equations',
  pacing: 'No-kit lesson: 60 minutes. Hardware route: about 3 to 5 supervised sessions (a planning estimate, not a promise).',
  summary: 'Identify spring-mass dynamics and investigate the damping trade-off between ringing and sensitivity, first with SYNTHETIC data in 60 minutes, then with a safe spring-mass build.',
  readiness: 'The 60-minute lesson needs only the supplied synthetic data, a calculator or spreadsheet and the diagrams. No kit, account or live earthquake is required. Building the sensor is a separate, conditional hardware route.',
  tile: { assetId: 'seismometer-build-diagram', alt: 'Original diagram: a mass hangs from a spring on a moving base; its relative displacement is watched by video or an optional non-contact coil.' },
  researchQuestion: tex`How does damping change the sensitivity, ringing and settling of a school seismometer, and which setting is best for a stated vibration-measurement task?`,
  published: {
    label: 'Published build (what the sources describe)',
    text: 'The Swiss Seismological Service at ETH Zurich describes a classroom seismometer developed by HES-SO Valais-Wallis, with printable parts and an Arduino acquisition pathway. Ted Channel’s first-party TC1 project documents a spring, suspended magnet, coil and damper. These show that educational instruments of this kind exist. FIT has not built either one, and the research sequence here is an independently authored adaptation, not endorsed by those organisations.',
    sourceIds: ['sssSeismometer', 'tc1'],
  },
  proposed: {
    label: 'Proposed student investigation (not a claim that FIT built this)',
    text: 'The student-owned contribution is a calibrated mechanical model, a reproducible test method and a justified damping choice. Merely producing a wiggly trace is not the research outcome. The classroom instrument does not predict earthquakes and gives no safety warnings.',
  },
  prerequisites: [
    'Required: forces, mass, displacement-time graphs, ratios, units, mean and range.',
    'Helpful: Hooke’s law, sine waves, exponentials and spreadsheets.',
    'Extension: derivatives, complex amplitudes and Fourier analysis. Give less-prepared learners pre-plotted traces and ask for trends before introducing equations.',
    'Learning goals: distinguish the motion being measured from the sensor’s own response; estimate stiffness, natural frequency and damping; fit a simple model; identify a trade-off rather than declare one design best.',
  ],
  concepts: [
    {
      id: 'static-calibration',
      title: 'Static calibration of the spring',
      body: tex`Stiffness comes from a graph of force against extension through several loads, not from one reading. Stay within the spring’s linear range. Here $k$ is in N/m, $F$ in N and $x$ in m.`,
      equations: [{ tex: String.raw`k=\frac{\Delta F}{\Delta x}`, caption: 'Spring constant from the slope of force against extension.' }],
      sourceIds: [],
    },
    {
      id: 'natural-frequency',
      title: 'Natural frequency',
      body: tex`The undamped angular frequency is $\omega_0$ in rad/s and the frequency is $f_0$ in Hz, with mass $m$ in kg. The simplest model omits the spring’s own effective mass, so check it if a graph of $f_0^2$ against $1/m$ is not straight.`,
      equations: [{ tex: String.raw`\omega_0=\sqrt{\frac{k}{m}},\qquad f_0=\frac{\omega_0}{2\pi}`, caption: 'Natural angular frequency and frequency.' }],
      sourceIds: ['openstaxDamped'],
    },
    {
      id: 'relative-motion',
      title: 'What the sensor measures: relative motion',
      body: tex`Let $y$ be the base displacement, $x$ the absolute mass displacement and $z=x-y$ the relative displacement, all in m. For a linear viscous model the measured relative motion obeys the equation below, where the damping coefficient $c$ has units N·s/m. This is a model to test, not a guarantee that real friction is viscous.`,
      equations: [{ tex: String.raw`m\ddot{z}+c\dot{z}+kz=-m\ddot{y}`, caption: 'Relative motion of a damped spring-mass sensor driven by base acceleration.' }],
      sourceIds: ['openstaxDamped'],
    },
    {
      id: 'damping-ratio',
      title: 'Damping ratio and ring-down',
      body: tex`The dimensionless damping ratio is $\zeta$. For $0<\zeta<1$ the damped frequency is $\omega_d$ and free motion is a decaying oscillation; at and above critical damping there are no repeated sinusoidal peaks. Successive same-sign peaks give a log decrement $\delta$, also dimensionless. Subtract the equilibrium offset first, use several peak pairs and report the variability.`,
      equations: [
        { tex: String.raw`\zeta=\frac{c}{2\sqrt{km}},\qquad \omega_d=\omega_0\sqrt{1-\zeta^{2}}`, caption: 'Damping ratio and damped frequency.' },
        { tex: String.raw`\delta=\ln\frac{A_n}{A_{n+1}},\qquad \zeta=\frac{\delta}{\sqrt{4\pi^{2}+\delta^{2}}}`, caption: 'Damping ratio from successive same-sign peaks.' },
      ],
      sourceIds: ['openstaxDamped'],
    },
    {
      id: 'frequency-response',
      title: 'Sensitivity depends on frequency',
      body: tex`For sinusoidal base motion at frequency $f$ let $r=f/f_0$. The steady-state amplitude ratio is dimensionless, and the relative motion is not equal to ground displacement at every frequency. At resonance ($r=1$) the ratio is $1/(2\zeta)$, so more damping lowers the peak.`,
      equations: [{ tex: String.raw`\left|\frac{Z}{Y}\right|=\frac{r^{2}}{\sqrt{(1-r^{2})^{2}+(2\zeta r)^{2}}}`, caption: 'Amplitude ratio of relative to base motion.' }],
      sourceIds: [],
    },
    {
      id: 'coil',
      title: 'Optional magnet and coil readout',
      body: tex`A moving magnet in a coil of $N$ turns produces an emf in volts from the changing flux $\Phi$ in webers. Locally the emf is proportional to the velocity of the relative motion with a signed calibration factor $G$ in V·s/m. The coil senses a velocity-like signal, not displacement directly.`,
      equations: [{ tex: String.raw`\mathrm{emf}=-N\frac{d\Phi}{dt}\approx G\,\dot{z}`, caption: 'Coil emf and its local linear approximation.' }],
      sourceIds: [],
    },
  ],
  diagrams: [
    { id: 'seismometer-build-diagram', title: 'Spring-mass sensor on a moving base', alt: 'A mass hangs from a spring attached to a frame on a moving base. Labels mark the spring stiffness k, the base motion y of t, the relative displacement z equal to x minus y tracked by video or a calibrated sensor, and an optional non-contact sensing coil near a magnet.', caption: 'Original conceptual diagram supplied with the curriculum. It is not a construction drawing: secure the mass and frame.' },
    { id: 'seismometer-simulation-plot', title: 'SYNTHETIC damping comparison', alt: 'Three calculated displacement traces begin at 5 millimetres and fall with time. The trace with damping ratio 0.05 rings for many cycles, 0.20 for a few, and 0.60 barely oscillates.', caption: 'Original SYNTHETIC model output (same spring and mass, three damping ratios). It is not a measurement.' },
  ],
  buildSteps: [
    { id: 'layout', title: 'Plan the mechanical layout', body: 'Draw the layout and identify all moving mass. Choose a small, safe motion range. Have your teacher approve the support and retention method before anything is assembled.', diagramId: 'seismometer-build-diagram', sourceIds: ['sssSeismometer', 'tc1'] },
    { id: 'stiffness', title: 'Calibrate the stiffness', body: 'Measure the spring extension under at least four small known loads. Plot $F$ against $x$ and estimate $k$ from the slope, not from the spring’s advertised value alone.', sourceIds: [] },
    { id: 'record', title: 'Record a free ring-down', body: 'Attach a high-contrast marker and record a gently displaced mass. Keep a ruler in the same plane as the marker to avoid perspective error. Measure the frame rate or the timestamps.', sourceIds: [] },
    { id: 'trials', title: 'Repeat at three damping settings', body: 'Record three ring-down trials at each of three damping settings. Do not change mass and damping at the same time, and note any sideways motion or contact.', diagramId: 'seismometer-simulation-plot', sourceIds: [] },
    { id: 'fit', title: 'Fit and predict', body: 'Estimate $f$ and $\\zeta$, then predict an independent held-back trace. Report residuals rather than adjusting parameters separately at every time point.', sourceIds: [] },
    { id: 'base-test', title: 'Base-excitation test', body: 'Move the support a small, safe amount and measure both the base and the mass. Without a measured input motion you cannot claim an absolute sensitivity calibration. If no repeatable shaker is available, finish with ring-down identification and label the frequency response as a prediction.', sourceIds: [] },
    { id: 'compare', title: 'Compare predicted and measured ratios', body: 'Compare predicted and measured amplitude ratios at a small number of controlled frequencies.', sourceIds: [] },
    { id: 'present', title: 'Present the decision', body: 'Present the design decision, the uncertainty, the failed trials and the next test that could falsify the model.', sourceIds: [] },
  ],
  equipment: [
    item('e-nokit', 'No-kit lesson: the diagram and plot (on screen or printed), the SYNTHETIC ring-down and frequency-response data, a calculator and graph paper'),
    item('e-frame', 'Basic build: a stable retort stand or frame, a suitable spring and securely fastened small masses'),
    item('e-measure', 'A ruler, a tray or enclosure, a stopwatch and a camera with a known recording frame rate, with a high-contrast marker on the mass'),
    item('e-damper', 'An air paddle or another safe, teacher-designed damping arrangement that gives several damping settings'),
    item('e-electronics', 'Optional electronic extension: a mechanically retained magnet, a coil, a low-voltage amplifier or data logger, a USB or battery supply, a multimeter and technician support'),
  ],
  safety: {
    intro: 'No kit is needed for the 60-minute lesson. For hardware, your teacher approves the set-up first. Component prices and availability have not been checked and no purchase list is approved. Do not assume a microphone input measures very low frequencies or DC correctly.',
    items: [
      item('s-secure', 'The stand is secured, a tray sits beneath the mass, and masses and magnets are retained mechanically.'),
      item('s-clear', 'Fingers and eyes are kept clear of falling or snapping parts.'),
      item('s-magnets', 'Strong magnets are used only under teacher control (pinch, ingestion and implant risks). A non-magnetic, video-tracked mass is the default.'),
      item('s-no-mains', 'No mains wiring is used, and nobody climbs to shake a structure.'),
      item('s-no-safety-link', 'The device is never attached to building safety systems and makes no earthquake prediction or warning claim.'),
    ],
  },
  milestones: [
    { id: 'm-1', title: 'Milestone 1 (60-minute lesson)', evidence: 'Correctly labelled plots and a testable design decision from the SYNTHETIC data.' },
    { id: 'm-2', title: 'Milestone 2', evidence: 'Safe mechanical assembly and a stiffness calibration.' },
    { id: 'm-3', title: 'Milestone 3', evidence: 'Repeatable ring-down data with fitted parameters and uncertainty.' },
    { id: 'm-4', title: 'Milestone 4', evidence: 'A held-out prediction, or an independently measured base-response comparison. An earthquake recording is not a required success criterion.' },
  ],
  tasks: [
    { id: 't-sim-damping', kind: 'simulation', title: 'Compare three damping ratios', body: 'In the simulation compare $\\zeta=0.05$, $0.2$ and $0.6$ with the other settings fixed. Record the usable peaks, settling time and resonance gain for each.' },
    { id: 't-sim-task', kind: 'simulation', title: 'Choose a damping ratio for a task', body: 'State a task (timing a brief event, or measuring a weak periodic vibration), choose a damping ratio and defend it with two numerical values from your rows. The data do not prove a universal best setting.' },
    { id: 't-exp-damping', kind: 'experiment', title: 'Experiment A: damping', body: 'Vary the damper setting; fit $\\zeta$, count peaks above a predeclared threshold and record the fit residual. Keep $k$, $m$, the starting displacement, the camera position and the sampling fixed. Take at least three repeats and keep rejected trials with reasons.' },
    { id: 't-exp-mass', kind: 'experiment', title: 'Experiment B: mass', body: 'Keep the spring unchanged and vary the retained mass. Test whether $f_0^2$ is proportional to $1/m$ over your range, and discuss the effective spring mass if it is not.' },
    { id: 't-exp-sensitivity', kind: 'experiment', title: 'Experiment C: sensitivity', body: 'Measure the base amplitude and the relative amplitude at each chosen frequency and compare $|Z/Y|$ with the model. State honestly any frequency range you could not reach.' },
  ],
  dataset: {
    intro: 'Rows from the simulation are SYNTHETIC. Measured rows come from your own captures; keep raw data separately using the downloadable measurement template, and report means, spread across repeats and instrument resolution. Never replace missing data with zeros.',
    columns: [
      column('massKg', 'Mass', 'kg', 'input', true),
      column('springNPerM', 'Spring constant k', 'N/m', 'input', true),
      column('dampingRatio', 'Damping ratio ζ (set)', '', 'input'),
      column('f0Hz', 'Natural frequency f₀', 'Hz', 'output', true),
      column('zetaFromPeaks', 'ζ fitted from peaks', '', 'output', true),
      column('usablePeaks', 'Peaks above threshold', '', 'output'),
      column('settlingTimeS', 'Settling time to 5%', 's', 'output', true),
      column('resonanceGain', 'Gain at resonance', '', 'output', true),
    ],
  },
  downloads: [
    { id: 'seismometer-synthetic-ringdown-csv', label: 'SYNTHETIC ring-down data (three damping ratios, 50 Hz, 10 s)', filename: 'synthetic_ringdown.csv' },
    { id: 'seismometer-synthetic-frequency-response-csv', label: 'SYNTHETIC frequency-response data', filename: 'synthetic_frequency_response.csv' },
    { id: 'seismometer-measurement-template-csv', label: 'Blank measurement template (a schema, not data)', filename: 'measurement_template.csv' },
  ],
  lesson60: {
    title: 'A 60-minute lesson with no kit',
    intro: 'Use the SYNTHETIC ring-down and frequency-response files, a calculator or spreadsheet, and the diagrams. Completing this lesson is not completing the hardware investigation.',
    steps: [
      { id: 'a', minutes: '0 to 8', title: 'Frame the question', body: 'Show the diagram. Ask whether a trace can be interpreted without knowing how the sensor responds. Each group states a target: timing a brief event, or measuring a weak periodic vibration.' },
      { id: 'b', minutes: '8 to 18', title: 'Measure a period', body: 'Use the synthetic traces to measure a period and compare the ringing. Calculate $f_0$ for $m=0.100$ kg and $k=3.94784$ N/m.' },
      { id: 'c', minutes: '18 to 32', title: 'Split by damping ratio', body: 'Split the ring-down file by damping ratio and plot displacement against time. Estimate peak ratios for the lightly damped case and explain why the strongly damped case has fewer usable peaks.' },
      { id: 'd', minutes: '32 to 45', title: 'Choose a damping ratio', body: 'Graph the frequency-response file. Choose a damping ratio for your stated task and defend the choice with two numerical values.' },
      { id: 'e', minutes: '45 to 55', title: 'Questions and a test sketch', body: 'Answer multiple-choice questions 1 to 4 and short answer 2 (question 6 here). Sketch a real calibration experiment with one controlled variable and one uncertainty.' },
      { id: 'f', minutes: '55 to 60', title: 'Exit ticket', body: 'Write one claim the simulation supports, one claim that needs hardware, and one limitation that could reverse your design choice.' },
    ],
  },
  questions: [
    mcq('p08-q01', tex`Keeping $k$ constant, multiplying $m$ by four changes $f_0$ to:`, ['half', 'twice', 'four times', 'unchanged'], 1, 2),
    mcq('p08-q02', 'At resonance, increasing positive damping in the linear model generally:', ['decreases the relative-motion peak', 'increases the relative-motion peak', 'changes the units of the response', 'makes all frequencies equally sensitive'], 1, 0),
    mcq('p08-q03', 'With uniform sampling at 40 samples per second, the ideal Nyquist frequency is (real acquisition also needs anti-alias filtering):', ['20 Hz', '10 Hz', '40 Hz', '80 Hz'], 1, 1),
    mcq('p08-q04', 'A magnet and coil signal is most directly related to:', ['local relative velocity', 'static displacement', 'total mass only', 'earthquake magnitude without calibration'], 1, 3),
    short('p08-q05', 'Ten oscillations take 10.2 s. Estimate the frequency and describe one way to reduce the timing uncertainty.', 2),
    short('p08-q06', 'A student’s sensor rings for several seconds after a brief tap. Why is it wrong to conclude that the original disturbance lasted that long?', 2),
    short('p08-q07', 'Give two reasons why a good fit to one synthetic trace does not prove that a real sensor will measure earthquake ground motion accurately.', 2),
    derive('p08-q08', tex`Starting from $m\ddot{z}+kz=0$ and the trial solution $z=A\cos(\omega t)$, derive $f_0$. Evaluate it for $m=0.100$ kg and $k=3.94784$ N/m.`, 4),
    derive('p08-q09', tex`The peak envelope falls as $\exp(-\zeta\omega_0 t)$. Use the damped period $T_d=2\pi/[\omega_0\sqrt{1-\zeta^{2}}]$ to derive $\delta$ and then $\zeta$. Find $\zeta$ when consecutive same-sign peaks are 4.00 mm and 2.00 mm.`, 4),
    reflect('p08-q10', 'Reflection (not scored). What is being calibrated here: displacement, velocity, acceleration, or merely a voltage response? Which result changed your design choice, what would count as contradictory evidence, and where did the simulation make life easier than a real experiment?', 0),
  ],
  rubricFocus: {
    question: 'States the task (brief event or weak periodic vibration), the damping variable and the metric (usable peaks, settling time or resonance gain).',
    model: 'States the linear, viscous, rigid-base, small-motion assumptions and where friction or lateral swing could break them.',
    data: 'Keeps SYNTHETIC rows apart from measured rows and records the frame rate, calibration factors and rejected trials.',
    uncertainty: 'Reports spread over at least three repeats and the instrument resolution; does not replace missing data with zeros.',
    improvement: 'Predicts a held-back trace or amplitude ratio before testing a changed damping setting, and reports residuals.',
    safety: 'Applies the secured stand, tray, retained masses and magnet rules to the actual set-up and makes no earthquake claim.',
  },
  caveats: [
    'Model limits: small motion, a linear spring, constant damping, a rigid base, no lateral swing and known timing. Friction, enclosure drafts, electronic filtering and video-tracking error can break these assumptions.',
    'The SYNTHETIC data come from a teaching model (fixed seed 8102026, m = 0.100 kg, f₀ = 1.000 Hz, 50 Hz sampling for 10 s, ζ of 0.05, 0.20 and 0.60, displacement noise 0.050 mm). They are not specifications of the ETH or TC1 devices.',
    'This classroom instrument does not predict earthquakes, provide safety warnings or measure ground motion without a measured input calibration.',
  ],
  sourceIds: ['sssSeismometer', 'tc1', 'openstaxDamped'],
}

export default project
