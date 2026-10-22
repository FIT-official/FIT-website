import 'server-only'
import { tex, mcq, calc, short, derive, explain, reflect, item, column } from './builders.js'

const project = {
  slug: 'tinylev-acoustic-levitator',
  simId: 'tinylev',
  title: 'Acoustic levitation: array geometry, phase errors and stability',
  shortTitle: 'Acoustic levitator',
  field: 'Acoustics and instrumentation',
  level: 'Advanced secondary',
  pacing: 'Suggested pacing: 8 weeks. The simulation-only path needs no hardware. This is a planning suggestion, not a source claim.',
  summary: 'Model how emitter geometry and random phase or position errors move and weaken the central pressure node of a two-cap 40 kHz levitator, then test a stability metric on inert beads under teacher supervision.',
  researchQuestion: tex`How do the cap radius, the number of emitters and random phase or position errors change the position and the sharpness of the central pressure node (judged from a curvature proxy, not a real restoring force) in a two-cap 40 kHz array, and can we show the effect with a measured stability metric using inert beads?`,
  published: {
    label: 'Published build (what the source describes)',
    text: 'The University of Bristol record describes TinyLev, a multi-emitter single-axis acoustic levitator published in Review of Scientific Instruments 88, 085105 (2017, DOI 10.1063/1.4989995). It uses arrays of low-voltage 40 kHz transducers in a 3D-printed structure, and the final PDF is labelled CC BY on the record. FIT has not built or tested a TinyLev. The paper’s biological demonstrations are deliberately not reproduced here.',
    sourceIds: ['tinylev'],
  },
  proposed: {
    label: 'Proposed student investigation (not a claim that FIT built this)',
    text: 'Your team studies geometry and error tolerance. The default path is simulation-only. A hardware path, if your teacher approves an electrical and acoustic review, uses inert beads only and measures how long beads stay trapped for different known errors. No safe ultrasound exposure level is inferred on this page.',
  },
  prerequisites: [
    'Waves, superposition and standing waves, including nodes and antinodes.',
    'Complex-number phasors or the equivalent trigonometric addition of waves.',
    'Basic statistics: mean, sample standard deviation and standard error.',
    'Electrical safety awareness; any build is reviewed by your teacher first.',
  ],
  concepts: [
    {
      id: 'wavelength',
      title: 'Wavelength, standing waves and node spacing',
      body: tex`Sound in air travels at about $c = 331.3 + 0.606\,T$ m/s ($T$ in °C). For two opposed plane waves the pressure nodes are $\lambda/2$ apart. In a spherical-cap array most emitters are off the axis, so the spacing along the axis is larger than $\lambda/2$.`,
      equations: [{ tex: String.raw`\lambda=\frac{c}{f},\qquad d_{\text{ideal}}=\frac{\lambda}{2}`, caption: 'Wavelength and ideal node spacing.' }],
      sourceIds: [],
    },
    {
      id: 'axis-sum',
      title: 'Adding the emitter fields on the axis',
      body: tex`On the common axis the pressure is the phasor sum of the emitters. For an emitter on a cap of radius $R$ at polar angle $\theta_j$, with the cap at $z=\pm R\cos\theta_j$, the distance to an axis point $z$ is $r_j$. Each emitter has phase $\varphi_j$ and falls off as $1/r_j$ in this simple model.`,
      equations: [
        { tex: String.raw`p(z)=\sum_j \frac{R}{r_j}\,e^{\,i(k r_j+\varphi_j)},\qquad r_j=\sqrt{R^{2}\sin^{2}\theta_j+\big(z\mp R\cos\theta_j\big)^{2}}`, caption: 'Axial pressure from point emitters; the sign is set by which cap the emitter is on.' },
      ],
      sourceIds: [],
    },
    {
      id: 'phase-error',
      title: 'Phase errors reduce the coherent sum',
      body: tex`If each emitter has an independent Gaussian phase error with standard deviation $\sigma_\varphi$, the average of $e^{i\varphi}$ is smaller than 1. The expected coherent fraction shows how quickly accuracy is lost, though the random part also fills in the node.`,
      equations: [{ tex: String.raw`\big\langle e^{\,i\varphi}\big\rangle=e^{-\sigma_\varphi^{2}/2}`, caption: 'Coherent fraction for Gaussian phase noise.' }],
      sourceIds: [],
    },
    {
      id: 'trapping',
      title: 'Why small beads sit at nodes',
      body: tex`For a sphere much smaller than the wavelength, the acoustic radiation potential combines pressure and velocity terms with contrast factors $f_1$ and $f_2$ set by the bead and air properties. Dense small beads are pushed towards pressure nodes. Millimetre beads at 40 kHz are not much smaller than $\lambda/2\approx 4$ mm, so the formula is a guide only. The bead must also be held against its weight. The simulation reports only a curvature proxy: the second derivative of $|p|^2$ at the node, relative to its error-free value. It is NOT a real restoring force, a trap stiffness or a complete Gor’kov stability analysis.`,
      equations: [
        { tex: String.raw`U=V\left[\frac{f_1}{2\rho_0c_0^{2}}\langle p^{2}\rangle-\frac{3f_2\rho_0}{4}\langle v^{2}\rangle\right]`, caption: 'Gor’kov potential for a small sphere of volume V.' },
        { tex: String.raw`W=\rho_b\,\frac{\pi}{6}d^{3}g`, caption: 'Weight of a spherical bead of diameter d and density ρ_b.' },
      ],
      sourceIds: ['gorkov'],
    },
  ],
  diagrams: [
    { id: 'tinylev-two-cap-geometry', title: 'Two opposed emitter caps and the common axis', alt: 'Cross-section diagram: two curved caps of small circles (emitters) face each other above and below a vertical dashed axis. The centre is marked, with the cap radius R and polar angle theta drawn for one emitter. A bead is shown at a pressure node on the axis.', caption: 'Original explanatory diagram of the geometry used in the model. It is not a photograph or a copy of the published design.' },
    { id: 'tinylev-phase-error-pressure', title: 'Effect of phase errors on the axial pressure', alt: 'Two sketched curves of squared pressure against height z. The upper curve has deep regular dips at the nodes. The lower curve has shallower, slightly shifted dips, labelled with phase errors.', caption: 'Original schematic, not simulation output; use the simulation panel for numbers.' },
  ],
  buildSteps: [
    { id: 'choose-path', title: 'Choose the path with your teacher', body: 'Decide whether to stay simulation-only or to build. The hardware path requires an electrical design review and an acoustic exposure plan that your teacher approves. Record the decision in the plan.', sourceIds: [] },
    { id: 'geometry', title: 'Fix the geometry', body: 'Choose a cap radius, a cap angle and an emitter count to study. Use the simulation to predict the node position and spacing before you build anything.', diagramId: 'tinylev-two-cap-geometry', sourceIds: ['tinylev'] },
    { id: 'structure', title: 'Obtain or print the structure', body: 'If you build, check the licence of the design files you use. The Bristol record labels the final paper CC BY, but a file you download may have different terms. Use a printed structure that can be inspected for strength.', sourceIds: ['tinylev'] },
    { id: 'phase-check', title: 'Check emitter phase', body: 'Mark the polarity of each emitter and, with your teacher, compare their phase against a reference using a small microphone and oscilloscope. Record the spread; it becomes the measured phase error.', diagramId: 'tinylev-phase-error-pressure', sourceIds: [] },
    { id: 'drive', title: 'Drive the array under supervision', body: 'Power the array only for short periods with a teacher-approved low-voltage driver, with a current limit and no exposed conductors. Keep hands, ears and faces away from the field.', sourceIds: [] },
    { id: 'stability', title: 'Measure stability with inert beads', body: 'Using non-conductive tweezers and small expanded-polystyrene beads, record how long a bead stays trapped over 60 s trials for each configuration. Repeat each at least five times. No liquids, no biological samples.', sourceIds: [] },
  ],
  equipment: [
    item('e-trans', 'Ultrasonic transducers at 40 kHz and a teacher-approved low-voltage driver with a current limit'),
    item('e-struct', 'Printed or machined holder with the chosen cap geometry'),
    item('e-mic', 'Small microphone and oscilloscope for relative phase checks'),
    item('e-beads', 'Inert expanded-polystyrene beads, about 1 to 3 mm diameter'),
    item('e-tweezers', 'Non-conductive tweezers and a ruler or scaled camera view for position'),
    item('e-timer', 'Timer for the 60 s trapping trials'),
  ],
  safety: {
    intro: 'Hardware work is optional. The ultrasound exposure and electrical design must be reviewed by your teacher; this page does not state a safe level.',
    items: [
      item('s-review', 'My teacher has reviewed and approved the electrical design, supply voltage and current limit.'),
      item('s-expo', 'My teacher has approved how long the array is run and where people stand. I do not assume any exposure level is safe.'),
      item('s-inert', 'Only inert beads are used. No liquids, insects, cells, food or other biological material.'),
      item('s-skin', 'No hands, ears or faces are placed in the acoustic field while it is on.'),
      item('s-power', 'The array is switched off before a bead is loaded, moved or removed.'),
      item('s-solder', 'Any soldering is done under supervision with ventilation and eye protection.'),
    ],
  },
  milestones: [
    { id: 'm-plan', title: 'Question, variables and path agreed', evidence: 'Plan section approved by your teacher.' },
    { id: 'm-sim', title: 'Simulation baseline', evidence: 'At least three simulation rows with errors set to zero and non-zero.' },
    { id: 'm-review', title: 'Hardware review recorded (if building)', evidence: 'Teacher review marked on your record.' },
    { id: 'm-phase', title: 'Phase spread measured', evidence: 'Measured phase spread with uncertainty, or a note that the path is simulation-only.' },
    { id: 'm-stability', title: 'Stability trials', evidence: 'At least five trials per configuration, or a simulation-only comparison with spread.' },
    { id: 'm-analysis', title: 'Analysis and improvement', evidence: 'Written justification of one change with a prediction.' },
  ],
  tasks: [
    { id: 't-sim-phase', kind: 'simulation', title: 'Phase error sweep', body: 'Hold the geometry fixed and sweep the phase error from 0 to 60 degrees. Record the node shift and the node-curvature proxy, with their spread.' },
    { id: 't-sim-geom', kind: 'simulation', title: 'Geometry sweep', body: 'Change the cap radius and emitter count. Which gives the sharpest pressure-squared node (largest curvature proxy) for a given phase error? Remember this is a proxy, not a trap stiffness.' },
    { id: 't-exp-phase', kind: 'experiment', title: 'Phase spread of your emitters', body: 'Measure the relative phase of each emitter. Convert the spread to a standard deviation in degrees and compare with your simulation range.' },
    { id: 't-exp-hold', kind: 'experiment', title: 'Bead hold time', body: 'For two configurations, record hold time across at least five 60 s trials. Report the mean and the standard error.' },
  ],
  dataset: {
    intro: 'Simulation rows come from the model; measured rows come from your trials.',
    columns: [
      column('capRadiusMm', 'Cap radius R', 'mm', 'input', true),
      column('emittersPerCap', 'Emitters per cap', '', 'input'),
      column('phaseErrorDeg', 'Phase error (s.d.)', '°', 'input', true),
      column('posErrorMm', 'Position error (s.d.)', 'mm', 'input', true),
      column('nodeSpacingMm', 'Node spacing', 'mm', 'output', true),
      column('nodeShiftMm', 'Node shift', 'mm', 'output', true),
      column('curvatureProxy', 'Node curvature proxy of |p|² vs nominal (not a force)', '', 'output', true),
      column('holdTimeS', 'Bead hold time', 's', 'output', true),
    ],
  },
  questions: [
    mcq('q1', 'In the small-sphere picture, which bead and field features favour trapping at a pressure node?', [
      'A bead much smaller than the wavelength and denser than air.',
      'A bead much larger than the wavelength and less dense than air.',
      'Any bead, provided the frequency is above 20 kHz.',
      'A bead whose weight is zero.',
    ], 2, 1),
    mcq('q2', tex`Each emitter has an independent Gaussian phase error with standard deviation $\sigma_\varphi$. What does $\langle e^{i\varphi}\rangle = e^{-\sigma_\varphi^2/2}$ tell you about a growing $\sigma_\varphi$?`, [
      'The coherent contribution falls, so the node becomes shallower and less well defined.',
      'The coherent contribution grows, so the node deepens.',
      'The wavelength changes.',
      'Nothing, because the errors average to exactly zero field.',
    ], 2, 3),
    short('q3', 'The axial node spacing found in your simulation was larger than $\\lambda/2$. Explain why that is expected for a spherical-cap array rather than for two plane waves.'),
    calc('q4', tex`Calculate $\lambda/2$ in mm for a 40 kHz drive in air at 20 °C, using $c = 331.3 + 0.606\,T$ m/s.`, 'mm'),
    calc('q5', tex`An expanded-polystyrene bead of diameter 2.0 mm has density 25 kg/m³. Calculate its weight $W=\rho_b\pi d^3 g/6$ in micronewtons (µN), with $g = 9.81$ m/s².`, 'µN'),
    derive('q6', tex`Show that for $\varphi \sim \mathcal{N}(0,\sigma^2)$ the mean of $e^{i\varphi}$ is $e^{-\sigma^2/2}$. State which standard result about the Gaussian you use.`),
    explain('q7', 'Explain why a 180° phase offset between the two caps puts a pressure node at the centre, whereas 0° puts an antinode there. Use path lengths in your answer.'),
    reflect('q8', 'The simulation’s node-curvature proxy of $|p|^2$ is not a restoring force or a full Gor’kov stability result. Say what it can and cannot tell you. Then design a stability metric that a classmate could repeat. What controls do you need, what is the dominant uncertainty, and what would make you stop a trial for safety reasons?'),
  ],
  rubricFocus: {
    question: 'Names the geometry or error parameter that is varied and the stability measure (node shift, the node-curvature proxy of |p|², or hold time).',
    model: 'States the point-emitter, on-axis-only assumptions and what the model cannot say about radial trapping.',
    data: 'Records repeated trials with the same procedure and keeps simulation and bead data apart.',
    uncertainty: 'Reports spread over repeated builds or trials and does not quote a single run as a result.',
    improvement: 'Predicts how a specific change (for example more emitters or reduced phase spread) alters the metric.',
    safety: 'Shows teacher review of the electrical and acoustic plan and uses inert beads only.',
  },
  caveats: [
    'This page and its model do not establish any safe ultrasound exposure threshold. Decisions on running time, distance and hearing or skin exposure belong to your teacher and school policy.',
    'Millimetre beads are comparable to half a wavelength, so small-sphere formulas are not reliable for them. Treat measured hold times as the evidence.',
    'The model ignores emitter directivity, reflections from the structure and nonlinear acoustics.',
  ],
  sourceIds: ['tinylev', 'gorkov'],
}

export default project
