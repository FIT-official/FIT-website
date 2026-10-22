import 'server-only'
import { tex, mcq, short, derive, reflect, item, column } from './builders.js'

// Project 09, adapted from the independent content owner's supplied guide (22 October 2026).
// Numerical examples are SYNTHETIC. This is not a claim that FIT built the Public Lab spectrometer.

const project = {
  slug: 'spectrometer-resolution-calibration',
  simId: 'spectrometer',
  title: 'Build a spectrometer and measure its resolution',
  shortTitle: 'Calibrated visible-light spectrometer',
  field: 'Optics, measurement and signal processing',
  level: 'Advanced Secondary 3 to 4 for calibration and uncertainty; Secondary 4 or JC for diffraction, convolution and signal models',
  pacing: 'No-kit lesson: 60 minutes. Hardware route: about 3 to 5 supervised sessions (a planning estimate, not a promise).',
  summary: 'Calibrate detector position to wavelength, then study the trade-off between slit width, spectral resolution and collected signal, first with SYNTHETIC spectra in 60 minutes, then with a camera spectrometer.',
  readiness: 'The 60-minute lesson needs only the supplied synthetic calibration and spectra files and a spreadsheet. No camera permission, account, grating or kit is required. The hardware route needs a suitable grating and a controllable camera, and quantitative wavelength claims also need a verified spectral reference.',
  tile: { assetId: 'spectrometer-build-diagram', alt: 'Original diagram: a light-tight enclosure holds an adjustable slit, a transmission grating and a fixed camera; diffracted light maps colours to detector positions.' },
  researchQuestion: tex`At fixed exposure and geometry, how does entrance-slit width trade spectral resolution against collected signal in a camera spectrometer?`,
  published: {
    label: 'Published build (what the sources describe)',
    text: 'Public Lab maintains an open papercraft spectrometer design and construction files. Its README identifies the CERN Open Hardware Licence 1.2. That is a real build precedent. FIT has not built it, and the experimental question, the synthetic data and the diagrams here are original, not a reproduction of the foldable design. No performance values from the simulated example are measurements of a Public Lab device.',
    sourceIds: ['publicLabSpectrometer', 'openstaxGratings'],
  },
  proposed: {
    label: 'Proposed student investigation (not a claim that FIT built this)',
    text: 'The student-owned contribution is a quantitative resolution and throughput study with independent calibration checks. A photograph of a rainbow alone is not the outcome. Public Lab’s templates are linked, not bundled or relicensed.',
  },
  prerequisites: [
    'Required: geometry, trigonometry, waves, straight-line graphs, averages and uncertainty.',
    'Helpful: spreadsheets and camera exposure. Extension: Gaussian functions, convolution and shot noise.',
    'Students not yet comfortable with functions can compare two pre-plotted spectra and mark the peaks and the valley.',
    'Learning goals: map detector position to wavelength; validate rather than merely fit a calibration; define a resolution criterion; separate camera counts from calibrated optical power; quantify a sensitivity and resolution trade-off.',
  ],
  concepts: [
    {
      id: 'grating',
      title: 'Grating equation',
      body: tex`For normal incidence on an ideal grating, $d$ and $\lambda$ are in m, $q$ is an integer diffraction order and $\theta$ is the angle from the grating normal. With $L$ lines per mm the spacing is $d=10^{-3}/L$ m. Oblique illumination needs a different geometry equation: do not force this simple relation onto an angled camera design.`,
      equations: [{ tex: String.raw`d\sin\theta=q\lambda`, caption: 'Normal-incidence grating equation.' }],
      sourceIds: ['openstaxGratings'],
    },
    {
      id: 'pixel-calibration',
      title: 'Pixel-to-wavelength calibration',
      body: tex`With pixel coordinate $p$, slope $a$ in nm per pixel and intercept $b$ in nm, a local linear calibration uses two references, then checks a third reference that was not used in fitting. The relationship need not be linear across the whole detector.`,
      equations: [{ tex: String.raw`\lambda=ap+b,\qquad a=\frac{\lambda_2-\lambda_1}{p_2-p_1}`, caption: 'Two-point linear calibration.' }],
      sourceIds: [],
    },
    {
      id: 'peak-width',
      title: 'Peak shape and width',
      body: tex`An isolated Gaussian line has a centre $\lambda_c$ and width $\sigma$, all in wavelength units. A source can have finite intrinsic width, so an observed width is not automatically the instrument’s resolution.`,
      equations: [{ tex: String.raw`I(\lambda)=I_{\max}\exp\!\left[-\frac{(\lambda-\lambda_c)^{2}}{2\sigma^{2}}\right],\qquad \mathrm{FWHM}=2\sqrt{2\ln 2}\,\sigma\approx 2.355\,\sigma`, caption: 'Gaussian line and its full width at half maximum.' }],
      sourceIds: [],
    },
    {
      id: 'blur-model',
      title: 'Instrument model and a declared resolution criterion',
      body: tex`A simple instrument model blurs the true spectrum with a normalised kernel $h$ (the star means convolution), then adds background and noise. One operational two-line criterion is that the valley divided by the mean peak height is below 0.80 after background subtraction. It is a declared classroom criterion, not a universal resolution law: state it before comparing designs.`,
      equations: [
        { tex: String.raw`I_{\text{measured}}=I_{\text{true}}*h+\text{background}+\text{noise}`, caption: 'Blur, background and noise.' },
        { tex: String.raw`\frac{\text{valley}}{\text{mean peak height}}<0.80`, caption: 'The declared two-line criterion used here.' },
      ],
      sourceIds: [],
    },
    {
      id: 'signal-uncertainty',
      title: 'Relative signal and calibration uncertainty',
      body: tex`Relative collected signal is the dark-subtracted sum of counts over a fixed pixel band. $D_p$ is a same-setting dark frame. The sum is in camera counts, not watts, without a radiometric calibration; gamma correction, automatic exposure, channel response and saturation can invalidate comparisons. Pixel localisation of $u_p$ pixels gives a wavelength uncertainty before adding reference uncertainty and calibration-model error.`,
      equations: [
        { tex: String.raw`S=\sum_{p}\left(I_p-D_p\right)`, caption: 'Relative collected signal in counts.' },
        { tex: String.raw`u_{\lambda}\approx |a|\,u_{p}`, caption: 'Wavelength uncertainty from pixel location alone, in nm.' },
      ],
      sourceIds: [],
    },
  ],
  diagrams: [
    { id: 'spectrometer-build-diagram', title: 'Spectrometer optical layout', alt: 'A dark enclosure with fixed geometry and camera settings contains an adjustable slit, a transmission grating and a camera. Light from the slit reaches the grating and diffracted colours land at different positions on the camera, so pixel position maps to wavelength.', caption: 'Original conceptual optical path supplied with the curriculum, not to scale. Use a diffuse low-power source and never view the Sun.' },
    { id: 'spectrometer-simulation-plot', title: 'SYNTHETIC resolution comparison', alt: 'Two simulated lines at 520 and 530 nanometres are increasingly blurred as the model slit widens from 0.1 to 0.6 millimetres, while the total light collected grows.', caption: 'Original SYNTHETIC model output. It is not a measurement of any real spectrometer.' },
  ],
  buildSteps: [
    { id: 'path', title: 'Sketch the optical path', body: 'Fix the camera, grating and slit positions so that changing slit width does not also change angle or distance.', diagramId: 'spectrometer-build-diagram', sourceIds: ['publicLabSpectrometer'] },
    { id: 'enclosure', title: 'Assemble a light-tight enclosure', body: 'Use card slit plates with measured openings. Do not put sharp exposed edges near eyes or the camera, and use scissors and card rather than exposed razor blades.', sourceIds: [] },
    { id: 'first-light', title: 'Find a first-order spectrum', body: 'Start with diffuse, low-brightness visible light. Locate the first-order spectrum without looking through the apparatus at an intense source.', sourceIds: [] },
    { id: 'lock', title: 'Lock the camera settings', body: 'Lock exposure, gain, focus and white balance where possible. Record whether the camera provides raw or linear data; otherwise label intensity comparisons as provisional.', sourceIds: [] },
    { id: 'dark', title: 'Capture dark frames', body: 'Reduce exposure if any pixel saturates. Use the same integration band and the same background treatment for every trial.', diagramId: 'spectrometer-simulation-plot', sourceIds: [] },
    { id: 'calibrate', title: 'Calibrate with verified references', body: 'Calibrate against at least two verified references and test an independent third. If no reference is available, keep the pixel coordinate and do not invent wavelength values.', sourceIds: [] },
    { id: 'repeats', title: 'Repeat at each slit width', body: 'Record at least three repeats at each slit width. Keep source position, source power, optical geometry and camera settings unchanged.', sourceIds: [] },
    { id: 'analyse', title: 'Estimate width and valley ratio', body: 'Estimate the isolated-line FWHM and the two-line valley criterion only where appropriate. Compare relative throughput and calibration residuals.', sourceIds: [] },
    { id: 'decide', title: 'Make and record a design decision', body: 'Make a design decision for a stated source and line-separation task. Keep the raw images, the processing settings and the failed captures.', sourceIds: [] },
  ],
  equipment: [
    item('e-nokit', 'No-kit lesson: the synthetic calibration and spectra files, the two diagrams, a calculator and a spreadsheet or printed plots'),
    item('e-enclosure', 'Build: an opaque card box or printed enclosure, black tape, card slit plates with several measured widths and a fixed camera mount'),
    item('e-grating', 'A teacher-supplied transmission grating, a ruler and diffuse, low-power visible light sources'),
    item('e-camera', 'A camera with exposure controls (a webcam is preferable for repeatability)'),
    item('e-reference', 'Calibration: a teacher-approved reference with independently known line wavelengths, or a calibrated reference spectrometer. Coloured LED labels are not sufficient wavelength standards.'),
    item('e-cells', 'Optional extension: sealed clear cells with water and food colouring for relative transmission, only after a blank-reference procedure and a linearity check'),
  ],
  safety: {
    intro: 'Use diffuse, low-power visible sources. Prices and stock have not been checked and no purchase is needed for the 60-minute lesson. Teacher approval is required before any change to the light source or cutting method.',
    items: [
      item('s-sun', 'The device is never pointed at the Sun, a laser, a UV lamp, a welding arc or an intense exposed lamp.'),
      item('s-cut', 'No optical discs are cut, lamps are not opened, and no exposed razor-blade slit is used.'),
      item('s-mains', 'No mains wiring is touched, and liquids are kept away from electronics.'),
      item('s-camera', 'The camera is secured and sharp slit edges are kept away from eyes and the lens.'),
      item('s-approval', 'My teacher has approved the light source and the cutting method.'),
    ],
  },
  milestones: [
    { id: 'm-1', title: 'Milestone 1 (60-minute lesson)', evidence: 'Calibrated SYNTHETIC plots and a defensible resolution and throughput conclusion.' },
    { id: 'm-2', title: 'Milestone 2', evidence: 'A repeatable spectrum in a stable enclosure.' },
    { id: 'm-3', title: 'Milestone 3', evidence: 'An independent wavelength check, or a clearly labelled pixel-only study.' },
    { id: 'm-4', title: 'Milestone 4', evidence: 'A replicated slit sweep with uncertainty and explicit detector limitations.' },
  ],
  tasks: [
    { id: 't-sim-calibration', kind: 'simulation', title: 'Calibrate and check a held-out point', body: 'Use the two fit rows of the calibration file to find $a$ and $b$, then predict the held-out row. Explain why fitting and checking on the same two points is weak evidence.' },
    { id: 't-sim-slit', kind: 'simulation', title: 'Slit-width trade-off', body: 'For model slit widths 0.1, 0.3 and 0.6 mm record the FWHM, the valley ratio and the signal over 500 to 550 nm. Which design separates the lines, which collects the most signal, and what is the trade-off?' },
    { id: 't-exp-sweep', kind: 'experiment', title: 'Experiment A: slit-width sweep', body: 'Vary the slit width; measure the isolated-line width, the two-line valley ratio, the background-corrected integrated counts and the repeatability. Keep source, exposure, gain, camera placement and analysis band fixed.' },
    { id: 't-exp-calibration', kind: 'experiment', title: 'Experiment B: calibration robustness', body: 'Fit two references and evaluate independent references across the detector. Compare a linear and a cautiously justified nonlinear calibration; extra parameters can overfit sparse references.' },
    { id: 't-exp-drift', kind: 'experiment', title: 'Experiment C: source drift', body: 'Repeat one setting at the beginning and the end of the sequence and randomise the slit order, to separate instrument effects from lamp warm-up or battery decline.' },
  ],
  dataset: {
    intro: 'Simulation rows are SYNTHETIC. Measured rows are your own; keep source identity, camera model and file-naming rules separately, and never infer a source’s chemistry from an uncalibrated school spectrum.',
    columns: [
      column('slitMm', 'Slit width', 'mm', 'input', true),
      column('separationNm', 'Line separation', 'nm', 'input', true),
      column('fwhmNm', 'Line FWHM', 'nm', 'output', true),
      column('valleyRatio', 'Valley ÷ mean peak', '', 'output', true),
      column('signalCounts', 'Relative signal 500 to 550 nm', 'counts', 'output', true),
      column('heldOutResidualNm', 'Held-out calibration residual', 'nm', 'output', true),
    ],
  },
  downloads: [
    { id: 'spectrometer-synthetic-calibration-csv', label: 'SYNTHETIC calibration points (two fit rows and one held-out row)', filename: 'synthetic_calibration.csv' },
    { id: 'spectrometer-synthetic-spectra-csv', label: 'SYNTHETIC spectra for slit widths 0.1, 0.3 and 0.6 mm', filename: 'synthetic_spectra.csv' },
    { id: 'spectrometer-measurement-template-csv', label: 'Blank measurement template (a schema, not data)', filename: 'measurement_template.csv' },
  ],
  lesson60: {
    title: 'A 60-minute lesson with no kit',
    intro: 'Use the SYNTHETIC calibration and spectra files, a spreadsheet or printed plots, and the diagrams. Completing this lesson is not completing the hardware investigation.',
    steps: [
      { id: 'a', minutes: '0 to 8', title: 'Frame the question', body: 'Show the layout. Ask what would turn a colourful image into a measurement.' },
      { id: 'b', minutes: '8 to 18', title: 'Calibrate and check', body: 'Use the two fit rows of the calibration file to find $a$ and $b$, and predict the held-out row. Explain why fitting and checking on the same two points is weak evidence.' },
      { id: 'c', minutes: '18 to 32', title: 'Plot each slit width', body: 'Plot the observed counts against wavelength for each model slit width on the same axes. Mark the two peaks, the valley and the background.' },
      { id: 'd', minutes: '32 to 43', title: 'Criterion and signal', body: 'Calculate the declared valley criterion and an integrated signal over 500 to 550 nm. Which design separates the lines? Which collects the most signal? Describe the trade-off.' },
      { id: 'e', minutes: '43 to 53', title: 'Questions and controls', body: 'Answer the multiple-choice questions and the calibration derivation. Name three controls for a physical experiment.' },
      { id: 'f', minutes: '53 to 60', title: 'One-minute design pitch', body: 'Each group pitches a design with one predicted benefit and one limitation that hardware must test.' },
    ],
  },
  questions: [
    mcq('p09-q01', 'The most useful way to check a two-point calibration is to:', ['test an independent reference', 'reread the same two points', 'change the exposure', 'assume the camera is linear'], 1, 1),
    mcq('p09-q02', 'In the stated model, a wider slit generally:', ['collects more light but broadens the peaks', 'collects less light and always narrows the peaks', 'changes Planck’s constant', 'removes all noise'], 1, 3),
    mcq('p09-q03', 'Two peaks merge after broadening. This shows that:', ['the instrument cannot resolve that pair under those conditions', 'the source has only one wavelength', 'the source is unsafe', 'the grating equation is false'], 1, 0),
    mcq('p09-q04', 'Relative counts from two auto-exposed photographs can be treated as absolute optical powers:', ['no, not without appropriate control and calibration', 'always', 'only if they look equally bright', 'if their file sizes match'], 1, 2),
    short('p09-q05', 'A calibration has slope 0.5 nm per pixel and a peak-location uncertainty of 2 pixels. What uncertainty contribution comes from location alone? Name one additional contribution.', 2),
    short('p09-q06', 'Why should students measure a dark frame, and why does subtracting it not fix saturation?', 2),
    short('p09-q07', 'Give a fair test for whether slit width, rather than camera settings or lamp drift, caused an observed spectral change.', 2),
    derive('p09-q08', tex`Derive the two-point linear calibration from $(p_1,\lambda_1)$ and $(p_2,\lambda_2)$. For $(100,\,450\text{ nm})$ and $(300,\,550\text{ nm})$ find $\lambda$ at $p=420$ and predict the value at $p=500$.`, 4),
    derive('p09-q09', tex`Starting from $d\sin\theta=q\lambda$, find the first-order angle for 550 nm light incident normally on a 500 lines/mm grating. Then derive the FWHM of the stated Gaussian peak by finding both half-height positions, and evaluate it for $\sigma=2$ nm.`, 4),
    reflect('p09-q10', 'Reflection (not scored). Did improving one metric make another worse, and which task decides the preferred compromise? Did your calibration hold outside the fitted range? Why is a high-resolution-looking chart not proof of high instrument resolution?', 0),
  ],
  rubricFocus: {
    question: 'Names the slit width as the varied quantity and the resolution (valley ratio or FWHM) and signal as the measures.',
    model: 'States the declared resolution criterion and the linear, unsaturated detector assumptions of the model.',
    data: 'Keeps SYNTHETIC rows apart from measured rows and records exposure, gain, white balance and dark frames.',
    uncertainty: 'Gives the location uncertainty in nm, the held-out residual and the repeatability at each slit width.',
    improvement: 'Predicts the effect of a changed slit width on both resolution and signal before testing it.',
    safety: 'Applies the diffuse, low-power source and no-Sun, no-laser rules to the actual set-up.',
  },
  caveats: [
    'The synthetic spectra come from a teaching model (seed 9102026, λ = 400 + 0.5p nm, lines at 520 and 530 nm, σ = 0.5 + 10w nm, background 20 counts, Poisson noise). The width rule is illustrative, not measured optics, and it does not reproduce a real RGB camera.',
    'Quantitative wavelength claims in hardware need a verified spectral reference. Without one, report pixels and postpone absolute calibration.',
    'A later absorbance study with water and food colour needs a blank and unchanged geometry, and must not be called a chemical identification or water-safety test.',
  ],
  sourceIds: ['publicLabSpectrometer', 'openstaxGratings'],
}

export default project
