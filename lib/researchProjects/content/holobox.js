import 'server-only'
import { tex, mcq, calc, short, derive, explain, reflect, item, column, rubricFor } from './builders.js'

const project = {
  slug: 'holobox-digital-holography',
  simId: 'holobox',
  title: 'Digital holography: how far, how fine, how deep?',
  shortTitle: 'Digital holography',
  field: 'Optics and computational imaging',
  level: 'Advanced secondary',
  pacing: 'Suggested pacing: 6 to 8 weeks, about 2 hours a week. This is a planning suggestion, not a source claim.',
  summary: 'Record an in-line hologram of a known opaque strip, refocus it numerically, and separate what the sensor’s pixels limit from what its aperture limits.',
  researchQuestion: tex`For an in-line digital hologram recorded on a small image sensor, how do the object-to-sensor distance $z$ and the pixel sampling together limit the sharpness and depth discrimination of the numerical reconstruction, and can our team separate the sampling limit from the aperture limit with measured data?`,
  published: {
    label: 'Published build (what the source describes)',
    text: 'The openUC2 HoloBox documentation, updated 10 October 2026, presents a digital-holography kit aimed at high-school teachers and students. It uses UC2 cubes, a Raspberry Pi 5 and a Camera Module v2.1, and discusses Michelson, Mach-Zehnder and in-line holography with numerical propagation. FIT has not built or tested this kit, and nothing on this page says otherwise.',
    sourceIds: ['holobox'],
  },
  proposed: {
    label: 'Proposed student investigation (not a claim that FIT built this)',
    text: 'Your team proposes its own bounded study: vary the sample-to-sensor distance and the effective pixel size (by software binning) for an opaque object of known width, and compare the reconstructed width and sharpness with numerical predictions. The setup below is a plan to be reviewed by your teacher, not a copy of the published kit.',
  },
  prerequisites: [
    'Wave interference and diffraction at the level of two-slit and single-slit patterns.',
    'Fourier series or the idea that a signal is a sum of spatial frequencies.',
    'Comfort reading simple Python or spreadsheet code; you do not need to write FFT code yourself.',
    'Measurement uncertainty: reading uncertainty, repeats, standard error.',
  ],
  concepts: [
    {
      id: 'interference',
      title: 'A hologram records phase as intensity',
      body: tex`A sensor records only intensity. When a reference wave $R$ and an object wave $O$ overlap, the intensity contains cross terms that depend on the phase difference, which is how phase information is stored.`,
      equations: [{ tex: String.raw`I = |R+O|^2 = |R|^2 + |O|^2 + R^{*}O + R\,O^{*}`, caption: 'The two cross terms carry the phase of the object wave.' }],
      sourceIds: ['gabor', 'holobox'],
    },
    {
      id: 'propagation',
      title: 'Numerical propagation',
      body: tex`The recorded field can be moved computationally to another plane by multiplying its spatial-frequency spectrum by a phase factor. For frequencies $f_x$ with $|f_x| < 1/\lambda$ this is the angular spectrum method. A band limit stops the kernel from being sampled too coarsely at large $z$.`,
      equations: [{ tex: String.raw`U(x,z)=\mathcal{F}^{-1}\Big\{\mathcal{F}\{U(x,0)\}\,\exp\!\Big[i\,2\pi z\sqrt{\lambda^{-2}-f_x^{2}}\Big]\Big\}`, caption: 'Angular spectrum propagation over distance z.' }],
      sourceIds: ['matsushima'],
    },
    {
      id: 'sampling',
      title: 'Sampling limit: what the pixels can record',
      body: tex`Interference fringes at angle $\theta$ to the sensor normal have period $\Lambda=\lambda/\sin\theta$. To record them, at least two pixels per period are needed, so the pixel pitch $p$ sets a largest recordable angle. This is a statement about sampling, not about the optics.`,
      equations: [{ tex: String.raw`\Lambda \ge 2p \;\Rightarrow\; \sin\theta_{\max}=\frac{\lambda}{2p},\qquad \mathrm{NA}_{\text{pix}}=\frac{\lambda}{2p}`, caption: 'Nyquist limit on the recordable numerical aperture.' }],
      sourceIds: [],
    },
    {
      id: 'aperture',
      title: 'Aperture limit: how much of the wavefront is captured',
      body: tex`A sensor window of half-width $W=Np/2$ at distance $z$ captures light only up to angle $\arctan(W/z)$. The smaller of the two numerical apertures sets the coherent cutoff: the finest grating period that can be reconstructed is about $\lambda/\mathrm{NA}$. The axial scale over which the reconstruction stays sharp shrinks roughly as $\lambda/\mathrm{NA}^2$ (an order-of-magnitude estimate).`,
      equations: [
        { tex: String.raw`\mathrm{NA}_{\text{geo}}=\frac{W}{\sqrt{z^{2}+W^{2}}},\qquad \mathrm{NA}_{\text{eff}}=\min\!\big(\mathrm{NA}_{\text{pix}},\mathrm{NA}_{\text{geo}}\big)`, caption: 'Effective numerical aperture.' },
        { tex: String.raw`\Lambda_{\min}\approx\frac{\lambda}{\mathrm{NA}_{\text{eff}}},\qquad \Delta z\sim\frac{\lambda}{\mathrm{NA}_{\text{eff}}^{2}}`, caption: 'Smallest period and depth scale (estimates).' },
      ],
      sourceIds: [],
    },
  ],
  diagrams: [
    { id: 'holobox-inline-layout', title: 'Proposed in-line holography layout', alt: 'Block diagram, left to right: a light source with pinhole, a collimated beam, an opaque strip object, a gap labelled z, and an image sensor. Some light passes around the strip as the reference wave and some is scattered by it as the object wave.', caption: 'Original explanatory diagram. It is not a photograph and not the layout of any specific kit.' },
    { id: 'holobox-sampling-vs-aperture', title: 'Sampling limit versus aperture limit', alt: 'Two panels. Left: a sensor row of pixels with a fringe whose period is under two pixels, marked as aliased. Right: a cone from the object to the sensor edge showing the geometric numerical aperture set by the window half-width and the distance z.', caption: 'Original explanatory diagram contrasting the two limits discussed above.' },
  ],
  buildSteps: [
    { id: 'layout', title: 'Plan the optical layout', body: 'Sketch the source, pinhole, sample holder and sensor on a rail with a distance scale. Decide the range of $z$ (for example 5 to 40 mm) and how you will read it. Keep the path short so the layout fits inside an enclosure.', diagramId: 'holobox-inline-layout', sourceIds: ['holobox'] },
    { id: 'safety', title: 'Safety review and enclosure', body: 'Show your teacher the source datasheet, the enclosure and the beam path. The source must be low power, enclosed, and approved by your teacher. Do not power it until the review is recorded.', sourceIds: [] },
    { id: 'source', title: 'Fix the source and sample holder', body: 'Mount the source so that the beam is horizontal and below eye level, and the sample holder so it slides along the rail without tilting. Mark the rail every 5 mm.', sourceIds: [] },
    { id: 'sensor', title: 'Mount and expose the sensor', body: 'Mount the sensor with its surface perpendicular to the beam. Set the exposure so the clear background is bright but not saturated, and record a background frame with no object. Note the pixel pitch from the sensor datasheet.', diagramId: 'holobox-sampling-vs-aperture', sourceIds: [] },
    { id: 'series', title: 'Record a distance series', body: 'With the opaque strip in place, record holograms at five or more distances. Measure each $z$ twice and note the reading uncertainty. Save raw frames and metadata together.', sourceIds: [] },
    { id: 'reconstruct', title: 'Reconstruct and measure', body: 'Back-propagate each hologram to its recorded $z$ using a script your teacher approves, then measure the strip width at half intensity. Repeat after software binning of 2, 4 and 8. Compare with the simulation.', sourceIds: ['matsushima'] },
  ],
  equipment: [
    item('e-source', 'Low-power enclosed light source with pinhole, approved by your teacher (LED or a school-approved enclosed laser module)'),
    item('e-sensor', 'Image sensor with a known pixel pitch from its datasheet, mounted without a lens if your layout requires it'),
    item('e-rail', 'Rigid rail or breadboard with a distance scale and a sliding sample holder'),
    item('e-target', 'Opaque strip or wire of known width, checked against a calibrated reference'),
    item('e-enclosure', 'Opaque enclosure and beam block so no stray light leaves the set-up'),
    item('e-computer', 'Computer with the capture software and a script for numerical propagation'),
  ],
  safety: {
    intro: 'Optics work is supervised. Items marked for your teacher must be confirmed before any source is powered.',
    items: [
      item('s-approve', 'My teacher has approved the specific light source and its power supply for this use.'),
      item('s-eyes', 'The beam path is enclosed and below eye level, and nobody looks into the source or its reflections.'),
      item('s-reflect', 'Shiny objects, jewellery and mirrors are kept out of the beam path.'),
      item('s-off', 'The source is switched off whenever the enclosure is open or samples are being changed.'),
      item('s-electric', 'Only the supplied power adapter is used, and cables are secured away from the optical rail.'),
    ],
  },
  milestones: [
    { id: 'm-plan', title: 'Question and variables agreed', evidence: 'Plan section filled in and approved by your teacher.' },
    { id: 'm-safety', title: 'Safety review recorded', evidence: 'Teacher review is marked on your record.' },
    { id: 'm-sim', title: 'Simulation baseline', evidence: 'At least three simulation rows recorded in the data table.' },
    { id: 'm-first', title: 'First measured hologram', evidence: 'One measured row with distance and width uncertainties.' },
    { id: 'm-series', title: 'Distance and binning series', evidence: 'At least five distances and three binning factors recorded.' },
    { id: 'm-analysis', title: 'Uncertainty analysis', evidence: 'Column statistics and a short written discussion of the dominant uncertainty.' },
  ],
  tasks: [
    { id: 't-sim-bin', kind: 'simulation', title: 'Binning sweep (window also grows)', body: 'In the simulation hold $z=10$ mm and change the binning from 1 to 8. Record each row. Note the assumption: the grid stays at 1024 samples, so binning also enlarges the modelled recorded window. This is not a fixed-sensor comparison. Which limit takes over, and at what binning?' },
    { id: 't-sim-z', kind: 'simulation', title: 'Distance sweep', body: 'With binning 1, vary $z$ from 2 to 40 mm. How does the smallest resolvable period change, and does the reconstructed width change?' },
    { id: 't-exp-z', kind: 'experiment', title: 'Measured distance series', body: 'Record the reconstructed strip width at five or more distances. Include repeat readings of $z$ and enter their uncertainty.' },
    { id: 't-exp-bin', kind: 'experiment', title: 'Software binning test', body: 'Bin the same raw frame by 2, 4 and 8 in software so the physical set-up stays unchanged. Compare the width and sharpness.' },
  ],
  dataset: {
    intro: 'Mark each row as simulation or measured. Enter an uncertainty for measured values where a column allows it.',
    columns: [
      column('wavelengthNm', 'Wavelength', 'nm', 'input'),
      column('pixelUm', 'Effective pixel pitch', 'µm', 'input', true),
      column('distanceMm', 'Distance z', 'mm', 'input', true),
      column('objectUm', 'True strip width', 'µm', 'input', true),
      column('naEffective', 'Effective NA', '', 'output'),
      column('reconWidthUm', 'Reconstructed width', 'µm', 'output', true),
      column('minPeriodUm', 'Smallest period λ/NA', 'µm', 'output'),
    ],
  },
  questions: [
    mcq('q1', 'Which statement best separates sampling from optical resolution in a digital hologram?', [
      'Pixel pitch fixes the largest angle the sensor can record, while the window size and distance fix how much of the wavefront is captured.',
      'Optical resolution depends only on pixel pitch, and sampling depends only on wavelength.',
      'Both are set by the exposure time of the sensor.',
      'Sampling is the same quantity as the numerical aperture.',
    ], 2, 2),
    mcq('q2', 'At a fixed sensor window and wavelength, the distance $z$ is doubled from a value much larger than the window half-width. What happens to $\\mathrm{NA}_{\\text{geo}}$?', [
      'It roughly halves.',
      'It roughly doubles.',
      'It stays the same.',
      'It becomes equal to $\\lambda/2p$.',
    ], 2, 1),
    short('q3', 'Why does reconstructing from intensity alone leave a twin image, and how does it show up in your simulation or data?'),
    calc('q4', tex`A sensor has pixel pitch $p = 1.12\ \mu\text{m}$. For $\lambda = 635$ nm, calculate $\mathrm{NA}_{\text{pix}} = \lambda/2p$ (no unit).`, ''),
    calc('q5', tex`The sensor window is 1024 pixels of pitch $1.12\ \mu\text{m}$ at $z = 10$ mm. Using $\mathrm{NA}_{\text{geo}} = W/\sqrt{z^2+W^2}$ with $W=Np/2$, calculate the smallest resolvable period $\lambda/\mathrm{NA}$ for $\lambda = 635$ nm, in µm.`, 'µm'),
    derive('q6', tex`Show that the largest recordable fringe angle satisfies $\sin\theta_{\max} = \lambda/(2p)$. Start from two plane waves with relative angle $\theta$ and state the sampling condition you use.`),
    explain('q7', 'In the simulation, binning the pixels by four at fixed $z$ also makes the modelled recorded window four times wider, yet the reconstruction can get worse. Explain why, and say how software binning of one real frame would differ from this model.'),
    reflect('q8', 'What result from your own data would make you change your conclusion about which limit dominates? Say what you would measure next and how uncertain you expect it to be.'),
  ],
  rubricFocus: {
    question: 'Names $z$ and the binning factor as the varied quantities and states the width measure and the range.',
    model: 'States the 1D, scalar, plane-wave assumptions and where the simulation’s twin-image treatment differs from the experiment.',
    data: 'Keeps simulation rows and measured rows apart and records $z$ for every frame.',
    uncertainty: 'Quantifies the uncertainty in $z$ and the half-intensity width, not only the pixel size.',
    improvement: 'Proposes one change (for example a larger window or a shorter $z$) with a numerical prediction.',
    safety: 'Describes the enclosure and source approval for the actual set-up and cites the kit documentation only for what it says.',
  },
  caveats: [
    'Pixel size limits sampling. Optical resolution is a different quantity, set by the numerical aperture that the sensor actually captures.',
    'A reconstructed width of an isolated strip can be read to a fraction of the smallest period, but fine internal detail cannot; do not claim resolution from a single edge.',
    'A colour-filter sensor and speckle change the effective pitch and noise; the simulation does not.',
  ],
  sourceIds: ['holobox', 'gabor', 'matsushima'],
}

export default project
