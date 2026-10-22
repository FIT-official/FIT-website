// SERVER ONLY. Answer keys and marking notes. Do not import this module from any client component,
// page props, metadata, generateStaticParams or public file. The only importers are service.js and tests.
// Numeric keys are computed from the same formulas the questions teach, and tests cross-check them
// against the simulations.
//
// mcq: `correct` is the option id, `startsWith` pins the option text so reordering cannot silently break the key.

const PI = Math.PI

const holoNaPix = 0.635 / (2 * 1.12)
const holoW = (1024 * 1.12) / 2
const holoNaGeo = holoW / Math.sqrt(10000 ** 2 + holoW ** 2)
const holoPeriod = 0.635 / holoNaGeo

const tinyC = 331.3 + 0.606 * 20
const tinyHalfLambdaMm = ((tinyC / 40000) * 1000) / 2
const tinyWeightUN = 25 * (PI / 6) * 0.002 ** 3 * 9.81 * 1e6

const raceAlong = 0.015 * 60
const raceCross = 0.5 * 1.0 * ((0.4 * PI) / 180) * 30 ** 2

const radarRes = 3e8 / (2 * 500e6)
const radarVmax = 3e8 / 24e9 / (4 * 200e-6)

const prandtlV = Math.sqrt((2 * 0.25 * 9.81) / (1.225 * 0.096 * 0.5))
const prandtlRe = (9.1 * (0.096 / 0.8)) / 1.46e-5

const cansatFspl = 20 * Math.log10((4 * PI * 500 * 433e6) / 3e8)
const cansatVt = Math.sqrt((2 * 0.3 * 9.81) / (1.225 * 0.8 * (PI * 0.6 ** 2) / 4))

const fpmPeriod = 0.53 / (0.1 + 0.371)
const fpmQ = 0.6 / 2
const fpmOverlap = (2 / PI) * (Math.acos(fpmQ) - fpmQ * Math.sqrt(1 - fpmQ * fpmQ))

const mcq = (correct, startsWith, why) => ({ type: 'mcq', correct, startsWith, why })
const calc = (value, tolerancePct, unit, working) => ({ type: 'calculation', value, tolerancePct, unit, working })
const text = (points, notes = '') => ({ type: 'text', points, notes })

export const ANSWER_KEYS = {
  'holobox-digital-holography': {
    q1: mcq('c', 'Pixel pitch fixes', 'Sampling (pixel pitch) limits the largest recordable fringe angle; window size and distance set the geometric aperture. The smaller NA governs.'),
    q2: mcq('b', 'It roughly halves.', 'For z much larger than W, NA_geo is approximately W/z, so doubling z halves it.'),
    q3: text([
      'The sensor records intensity only, so the phase of the object wave is missing.',
      'Back-propagating the square root of the intensity with zero phase also refocuses the conjugate term at the opposite distance.',
      'That term appears as an out-of-focus twin superimposed on the in-focus reconstruction; in the model it adds ripples around the strip.',
    ], 'Accept a clear link to the cross terms R*O and RO* in the intensity.'),
    q4: calc(holoNaPix, 2, '', 'NA_pix = lambda / (2p) = 0.635 / (2 x 1.12) = 0.283.'),
    q5: calc(holoPeriod, 2, 'µm', 'W = 1024 x 1.12 / 2 = 573.4 µm. NA_geo = 573.4 / sqrt(10000^2 + 573.4^2) = 0.0573. Period = 0.635 / 0.0573 = 11.1 µm.'),
    q6: text([
      'Two plane waves at relative angle theta form fringes of period Lambda = lambda / sin(theta).',
      'Nyquist requires at least two pixels per fringe period: Lambda >= 2p.',
      'Therefore sin(theta_max) = lambda / (2p).',
    ], 'Award the marks for stating the sampling condition explicitly.'),
    q7: text([
      'Binning by four multiplies the pitch by four, so NA_pix = lambda / (2 x 4p) falls by a factor of four.',
      'The geometric NA increases with the wider window but the effective NA is the smaller value, so it is now sampling-limited.',
      'Fringes finer than two binned pixels alias and corrupt the propagation.',
    ]),
    q8: text([
      'Names a specific measurement, such as a grating of known period, a distance sweep, or a binning sweep.',
      'Links the result to which NA is smaller.',
      'States the expected uncertainty and what would be a surprising result.',
    ], 'Open response: assess reasoning, not a single answer.'),
  },
  'tinylev-acoustic-levitator': {
    q1: mcq('b', 'A bead much smaller', 'In the small-sphere picture dense, small beads move to pressure nodes. Large or very light beads follow different rules.'),
    q2: mcq('d', 'The coherent contribution falls', 'Random phases reduce the coherent sum by exp(-sigma^2/2); the node becomes shallower and shifts.'),
    q3: text([
      'Emitters on a spherical cap are mostly off the axis.',
      'The axial component of the wave vector is k cos(theta), which is smaller than k.',
      'So the axial period of the interference is larger than lambda/2 (about 5.8 mm in the default model against 4.3 mm).',
    ]),
    q4: calc(tinyHalfLambdaMm, 1, 'mm', 'c = 331.3 + 0.606 x 20 = 343.4 m/s. lambda = 343.4 / 40000 = 8.586 mm. lambda/2 = 4.29 mm.'),
    q5: calc(tinyWeightUN, 2, 'µN', 'm = 25 x (pi/6) x (0.002)^3 = 1.047e-7 kg. W = m g = 1.03e-6 N = 1.03 µN.'),
    q6: text([
      'Write E[e^{i phi}] = integral of e^{i phi} f(phi) d phi for the Gaussian density.',
      'This is the characteristic function of the normal distribution at t = 1.',
      'Complete the square or quote the result: phi_X(t) = exp(i mu t - sigma^2 t^2 / 2), so with mu = 0 and t = 1 the value is exp(-sigma^2 / 2).',
    ], 'Accept a correct completion of the square.'),
    q7: text([
      'Both caps are at equal path length to the centre, so the waves arrive with the same phase delay.',
      'With 180 degrees between the caps the two contributions cancel at the centre, giving a node.',
      'With 0 degrees they add, giving an antinode; nodes then sit about a quarter wavelength either side.',
    ]),
    q8: text([
      'A metric such as hold time over a fixed trial length, with fixed bead and loading procedure.',
      'Controls: bead size and density, loading position, temperature, supply setting, orientation.',
      'Dominant uncertainty named and quantified; a stop rule for safety referring to the teacher’s review.',
    ], 'Open response.'),
  },
  'racecar-degraded-sensing-localisation': {
    q1: mcq('c', 'As the square of time.', 'A constant heading-rate bias produces a heading error proportional to t, and the cross-track error integrates that, giving a t^2 term.'),
    q2: mcq('a', 'The fix can still be wrong', 'Map ambiguity (for example a long featureless corridor) can give a confident but wrong match.'),
    q3: text([
      'Encoders measure wheel rotation, not motion over the ground.',
      'A spinning wheel produces counts without travel, and a locked wheel gives none while moving.',
      'An independent sensor (IMU, LiDAR, camera) is needed to detect the discrepancy.',
    ]),
    q4: calc(raceAlong, 1, 'm', 'e = epsilon x s = 0.015 x 60 = 0.90 m.'),
    q5: calc(raceCross, 2, 'm', 'b = 0.4 deg/s = 0.00698 rad/s. e = 0.5 x 1.0 x 0.00698 x 900 = 3.14 m.'),
    q6: text([
      'Write x_k = (1-K) x_{k-1} + K z_k and take variance in steady state: V = (1-K)^2 V + K^2 sigma^2.',
      'Solve V (1 - (1-K)^2) = K^2 sigma^2 with 1 - (1-K)^2 = K (2-K).',
      'So V = K sigma^2 / (2-K).',
    ]),
    q7: text([
      'With K = 1 the estimate equals the latest fix, so its error equals the fix noise sigma_z.',
      'This is the measurement noise floor plus any bias in the map or survey.',
      'Lower K averages noise but follows drift more slowly.',
    ]),
    q8: text([
      'Survey with a tape or laser level, repeated, with quoted uncertainty smaller than the expected errors.',
      'Check marks against each other by closing a loop.',
      'Names an irreducible uncertainty, such as wheel contact patch or tape sag.',
    ], 'Open response.'),
  },
  'range-doppler-radar-sar': {
    q1: mcq('d', 'It halves', 'Delta R = c / 2B, so doubling B halves the minimum separable range difference.'),
    q2: mcq('b', 'The chirp interval $T$', 'v_max = lambda / (4T). Shorter T raises the limit.'),
    q3: text([
      'The Hann window tapers the data, lowering sidelobes that would hide a weak neighbouring target.',
      'It does so at the cost of a wider main lobe, so two close targets of similar size merge sooner.',
      'The choice depends on whether dynamic range or resolution matters more.',
    ]),
    q4: calc(radarRes, 1, 'm', 'Delta R = c / 2B = 3.00e8 / (2 x 5.00e8) = 0.30 m.'),
    q5: calc(radarVmax, 1, 'm/s', 'lambda = c / f = 3.00e8 / 24e9 = 0.0125 m. v_max = 0.0125 / (4 x 200e-6) = 15.6 m/s.'),
    q6: text([
      'The sweep rate is B/T. An echo is delayed by tau = 2R/c.',
      'The transmitted and received chirps differ in frequency by the sweep rate times the delay.',
      'f_b = (B/T)(2R/c) = 2BR/(cT).',
    ]),
    q7: text([
      'The Doppler phase advance per chirp is sampled once per T, so the Doppler axis wraps at plus or minus 1/(2T).',
      'A speed outside plus or minus lambda/(4T) appears at an aliased speed.',
      'Shorten T (faster chirp rate), or lower the carrier frequency, to raise the limit; the trade-off is a larger beat frequency.',
    ]),
    q8: text([
      'Identifies one stage (windowing, bin-to-unit conversion, the sign convention or calibration).',
      'Proposes a test with a known target and says what error would indicate failure.',
    ], 'Open response.'),
  },
  'prandtl-wing-twist-glider': {
    q1: mcq('b', 'It lowers the angle of attack', 'Washout reduces local angle of attack near the tip, so outboard loading falls and inboard loading rises.'),
    q2: mcq('c', 'A much lower Reynolds number', 'Smaller chord and speed give a much lower Re; lift slope, drag and stall differ from full scale.'),
    q3: text([
      'Reynolds number is far lower, so lift slope, profile drag and stall behaviour differ.',
      'Structure, surface finish, flexibility and control systems differ.',
      'A published performance figure belongs to a specific vehicle and test, and cannot be scaled by shape alone.',
    ]),
    q4: calc(prandtlV, 1, 'm/s', 'V = sqrt(2 m g / (rho S C_L)) = sqrt(2 x 0.25 x 9.81 / (1.225 x 0.096 x 0.5)) = 9.13 m/s.'),
    q5: calc(prandtlRe, 2, '', 'Mean chord = 0.096 / 0.80 = 0.12 m. Re = 9.1 x 0.12 / 1.46e-5 = 7.5e4.'),
    q6: text([
      'From C_L = pi AR A1, A1 = C_L / (pi AR).',
      'e = A1^2 / sum(n A_n^2), so sum(n A_n^2) = A1^2 / e.',
      'C_Di = pi AR A1^2 / e = pi AR C_L^2 / (pi AR)^2 / e = C_L^2 / (pi e AR).',
    ]),
    q7: text([
      'A lower local angle of attack at the tip keeps the section further from its stall angle.',
      'The stall onset then moves inboard where control surfaces are less affected.',
      'It does not prove a better glide ratio, since twist also lowers total lift at fixed angle and shifts the trim; the net effect must be measured at the actual Reynolds number.',
    ]),
    q8: text([
      'Names concrete sources: launch speed and angle, air movement, wing twist drift with humidity, centre of gravity, surface finish.',
      'Says for each whether it was controlled, measured, or left in the scatter.',
    ], 'Open response.'),
  },
  'cansat-telemetry-tracking-antenna': {
    q1: mcq('a', 'It falls by about 6 dB.', 'Free-space loss is proportional to d^2, so doubling d adds 20 log10(2) = 6.02 dB.'),
    q2: mcq('d', 'Reflection, obstruction', 'An exponent above 2 means the signal falls faster than free space, typically due to ground effects or obstruction.'),
    q3: text([
      'A ground test checks link budget, path-loss exponent, pointing and tracking workload under controlled, repeatable conditions.',
      'It does not test descent dynamics, spin, antenna orientation changes, altitude-dependent fading or launch loads.',
      'Learning objectives about link engineering are met; a claim of flight performance is not.',
    ], 'Mark reasoning on what the test does and does not support.'),
    q4: calc(cansatFspl, 0.5, 'dB', 'L = 20 log10(4 pi d f / c) = 20 log10(4 pi x 500 x 433e6 / 3e8) = 79.2 dB.'),
    q5: calc(cansatVt, 1, 'm/s', 'A = pi x 0.6^2 / 4 = 0.283 m^2. v = sqrt(2 x 0.3 x 9.81 / (1.225 x 0.8 x 0.283)) = 4.61 m/s.'),
    q6: text([
      'Loss relative to peak is G(theta)/G0 = exp(-4 ln2 theta^2 / theta3dB^2).',
      'In dB: -10 log10 of this = 10 log10(e) x 4 ln2 x (theta/theta3dB)^2.',
      '10 log10(e) = 4.343 and 4 ln2 = 2.773, product 12.04, so about 12 (theta/theta3dB)^2 dB.',
    ]),
    q7: text([
      'Azimuth angle is atan(lateral/d0) for a drop point at distance d0 and a lateral drift speed w; its rate is w d0 / (d0^2 + (w t)^2).',
      'This is largest at the closest approach (t about 0), where the line of sight sweeps fastest.',
      'It grows with crosswind and with a closer station distance.',
    ]),
    q8: text([
      'Predicts that wet grass or metal fences change reflection and shadowing, shifting the exponent and increasing scatter.',
      'Proposes repeating the distance line over both surfaces and comparing fits with standard errors.',
    ], 'Open response.'),
  },
  'open-fourier-ptychographic-microscopy': {
    q1: mcq('c', 'The sum of the objective NA', 'NA_syn = NA_obj + sin(theta_max). The pupil is fixed but the spectrum is shifted by the illumination angle.'),
    q2: mcq('a', 'Redundant information', 'Overlapping Fourier regions give the redundancy used to recover phase from intensity-only images.'),
    q3: text([
      'A preprint has not been peer reviewed, so its claims are provisional.',
      'It can motivate and describe the work but is not independent verification.',
      'The technique itself has earlier published literature; the README preprint does not show that the specific instrument is validated for any biological use.',
    ]),
    q4: calc(fpmPeriod, 1, 'µm', 'NA_syn = 0.100 + 0.371 = 0.471. Period = 0.530 / 0.471 = 1.13 µm.'),
    q5: calc(fpmOverlap, 1, '', 'q = 0.6/2 = 0.3. A/(pi R^2) = (2/pi)[acos 0.3 - 0.3 sqrt(0.91)] = 0.6366 x (1.2661 - 0.2862) = 0.624.'),
    q6: text([
      'Each circle contributes a circular segment of half-angle alpha with cos(alpha) = (Delta/2)/R.',
      'Segment area = R^2 (alpha - sin alpha cos alpha).',
      'The lens is two segments: A = 2 R^2 acos(Delta/2R) - (Delta/2) sqrt(4R^2 - Delta^2).',
    ]),
    q7: text([
      'Each LED image gives an amplitude constraint on a shifted region of the sample spectrum.',
      'Where regions overlap, the estimates must agree, which constrains the unknown phase.',
      'Alternating projection between image space and Fourier space updates the spectrum until consistent.',
      'Failure modes: too little overlap, noise, LED misalignment or pupil aberration.',
    ]),
    q8: text([
      'Claims limited to the smallest group actually resolved on the inert target, with a stated judgement method and repeats.',
      'Refuses claims about biological samples, clinical value, or resolution beyond the target’s smallest feature.',
    ], 'Open response.'),
  },
}

export function getKey(slug, questionId) {
  return ANSWER_KEYS[slug]?.[questionId] || null
}

export function keysFor(slug) {
  return ANSWER_KEYS[slug] ? structuredClone(ANSWER_KEYS[slug]) : null
}

// Automatic checking of auto-markable questions; returns undefined for written work.
export function autoCheck(question, answer, key) {
  if (!key || !answer) return undefined
  if (key.type === 'mcq') return answer.choice ? answer.choice === key.correct : undefined
  if (key.type === 'calculation') {
    const v = Number(answer.value)
    if (!Number.isFinite(v)) return undefined
    return Math.abs(v - key.value) <= Math.abs(key.value) * (key.tolerancePct / 100)
  }
  return undefined
}
