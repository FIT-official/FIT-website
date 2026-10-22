import 'server-only'

// Concise simulation-first 60-minute plans for the original seven projects. Each needs only the on-page
// simulation, a calculator and the data table: no kit, no hardware, no account. They do not claim that any
// hardware is ready; the hardware route stays conditional on teacher approval and equipment.

const NOTE = 'Completing this 60-minute plan is not completing the hardware investigation. Anything that needs equipment stays conditional on teacher approval and on the equipment being available.'

const plan = (title, intro, steps) => ({
  title,
  intro: intro + ' ' + NOTE,
  steps: steps.map(([minutes, stepTitle, body], i) => ({ id: 'abcdef'[i], minutes, title: stepTitle, body })),
})

export const LESSONS_60 = {
  'holobox-digital-holography': plan('A 60-minute simulation-first lesson',
    'Use only the simulation and a calculator.',
    [
      ['0 to 8', 'Predict', 'Read the research question. Predict which limits sharpness first: the pixel sampling or the recorded aperture. Write your prediction in the team plan.'],
      ['8 to 18', 'Hand check', 'Set $\\lambda=635$ nm, pixel pitch 1.12 µm, binning 1 and $z=10$ mm. Compute $\\mathrm{NA}_{\\text{pix}}=\\lambda/2p$ by hand and compare it with the simulation.'],
      ['18 to 32', 'Distance sweep', 'Record rows for $z=5$, 10, 20 and 40 mm. Which NA limits the result, and how does the smallest resolvable period change?'],
      ['32 to 45', 'Binning sweep', 'Record rows for binning 1, 2, 4 and 8 at $z=10$ mm. Remember the model keeps 1024 samples, so binning also enlarges the modelled window. Where does the limiting factor switch?'],
      ['45 to 53', 'Questions', 'Answer questions 4 and 5 and write the model assumptions in your plan.'],
      ['53 to 60', 'Exit ticket', 'Write one claim the simulation supports and one claim that needs a real hologram.'],
    ]),
  'tinylev-acoustic-levitator': plan('A 60-minute simulation-first lesson',
    'Use only the simulation. No transducers, power supply or beads are involved.',
    [
      ['0 to 8', 'Predict', 'Read the research question and predict whether phase error or position error moves the central node more.'],
      ['8 to 18', 'Error-free baseline', 'Set both errors to zero. Compare the measured node spacing with $\\lambda/2$ and explain the difference in terms of off-axis emitters.'],
      ['18 to 32', 'Phase-error sweep', 'Sweep the phase error from 0 to 60 degrees and record the node shift and the node-curvature proxy with their spread. The proxy is not a restoring force.'],
      ['32 to 45', 'Geometry sweep', 'Change the cap radius and emitters per cap. Which gives the sharpest pressure-squared node for a given phase error?'],
      ['45 to 53', 'Questions', 'Answer questions 4 and 5. Write down what the proxy cannot tell you.'],
      ['53 to 60', 'Exit ticket', 'State one claim the simulation supports and what a bead trial would have to show before you trusted it.'],
    ]),
  'racecar-degraded-sensing-localisation': plan('A 60-minute simulation-first lesson',
    'Use only the simulation. No robot, LiDAR or floor survey is involved.',
    [
      ['0 to 8', 'Predict', 'Read the research question. Predict which grows faster with time: error from a heading bias or from a wheel-size error.'],
      ['8 to 18', 'Dead reckoning only', 'Set the gain to 0 and record the RMS error for three run lengths. Compare with the hand formulas in questions 4 and 5.'],
      ['18 to 32', 'Add map fixes', 'Raise the gain to 0.2 with no dropout and record the fused error. Then add 50 per cent dropout and a 10 s outage.'],
      ['32 to 45', 'Gain trade-off', 'Sweep the gain at two fix-noise levels. Which gain minimises the error, and how does it depend on the noise?'],
      ['45 to 53', 'Questions', 'Answer questions 4 and 5 and write the model assumptions in your plan.'],
      ['53 to 60', 'Exit ticket', 'State one claim the simulation supports and one thing only a surveyed floor test could show.'],
    ]),
  'range-doppler-radar-sar': plan('A 60-minute simulation-first lesson',
    'Use only the synthetic-target simulation. No radio transmitter or radar module is involved.',
    [
      ['0 to 8', 'Predict', 'Read the research question. Predict how doubling the bandwidth changes the range resolution.'],
      ['8 to 18', 'Recover a target', 'Run the default target, then compare the estimated and true range and speed with the bin sizes the simulation reports.'],
      ['18 to 32', 'Bandwidth sweep', 'Sweep the bandwidth and record the range error and the predicted resolution $c/2B$.'],
      ['32 to 45', 'Find the aliasing limit', 'Increase the target speed until the estimate wraps. Compare the wrap speed with $\\lambda/4T$.'],
      ['45 to 53', 'Questions', 'Answer questions 4 and 5. Note that the carrier frequency is an example, not a permission.'],
      ['53 to 60', 'Exit ticket', 'State one claim the simulation supports and what an approved, supervised measurement would need to check.'],
    ]),
  'prandtl-wing-twist-glider': plan('A 60-minute simulation-first lesson',
    'Use only the lifting-line simulation. No glider is built or flown.',
    [
      ['0 to 8', 'Predict', 'Read the research question. Predict whether washout raises or lowers the span efficiency for the default wing.'],
      ['8 to 18', 'Baseline', 'Record the default wing’s lift coefficient, span efficiency, speed and Reynolds number. Check the speed with the question 4 formula.'],
      ['18 to 32', 'Twist sweep', 'Sweep the tip twist from 0 to −6 degrees and record the span efficiency and glide ratio. Does the lift centroid move?'],
      ['32 to 45', 'Scale and Reynolds number', 'Increase the span and mass together. How does the Reynolds number change, and which model assumptions get worse?'],
      ['45 to 53', 'Questions', 'Answer questions 4 and 5 and write the model assumptions in your plan.'],
      ['53 to 60', 'Exit ticket', 'State one claim the simulation supports and one thing repeated hand-launched flights would have to show.'],
    ]),
  'cansat-telemetry-tracking-antenna': plan('A 60-minute simulation-first lesson',
    'Use only the link-budget simulation. No radio, launch or flight is involved.',
    [
      ['0 to 8', 'Predict', 'Read the research question. Predict which matters more for the smallest margin: beamwidth or pointing error.'],
      ['8 to 18', 'Hand check', 'Compute the free-space loss at 500 m and 433 MHz by hand (question 4) and compare it with the simulation’s trend.'],
      ['18 to 32', 'Beamwidth and pointing', 'Sweep the beamwidth from 20 to 100 degrees at two pointing errors. Record the smallest margin and the peak azimuth rate.'],
      ['32 to 45', 'Crosswind and distance', 'Increase the crosswind and the station distance. What sets the peak angular rate the tracker must follow?'],
      ['45 to 53', 'Questions', 'Answer questions 4 and 5. Write what your ground test would measure and the prediction it must beat.'],
      ['53 to 60', 'Exit ticket', 'State one claim the simulation supports and why free-space loss is optimistic near the ground.'],
    ]),
  'open-fourier-ptychographic-microscopy': plan('A 60-minute simulation-first lesson',
    'Use only the forward-model simulation. No microscope, LED array or slide is involved, and the project stays mentor-led.',
    [
      ['0 to 8', 'Predict', 'Read the research question. Predict how many of the four target zones one bright-field image resolves.'],
      ['8 to 18', 'Single image', 'Set no extra LEDs. Record the zones resolved and the amplitude error, then compare with the synthetic NA.'],
      ['18 to 32', 'LED pitch sweep', 'Sweep the LED pitch and record the pupil overlap and the zones resolved. At what overlap does the reconstruction fail?'],
      ['32 to 45', 'Noise and iterations', 'Add image noise and vary the iterations. When does more iteration stop helping?'],
      ['45 to 53', 'Questions', 'Answer questions 4 and 5. Write what the 1D coherent model cannot show.'],
      ['53 to 60', 'Exit ticket', 'State one claim the simulation supports and one you would refuse to make about a real instrument or any sample.'],
    ]),
}
