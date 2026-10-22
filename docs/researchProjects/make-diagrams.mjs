// Source of the 14 original explanatory SVG diagrams in public/research-projects/diagrams.
// They are drawn from scratch here (no third-party artwork, no photographs). To regenerate:
//   node docs/researchProjects/make-diagrams.mjs public/research-projects/diagrams
import { writeFileSync, mkdirSync } from 'node:fs'
import process from 'node:process'

const OUT = (process.argv[2] || 'public/research-projects/diagrams').replace(/[\/]*$/, '/')
mkdirSync(OUT, { recursive: true })

const INK = '#1b2a3a', BLUE = '#1f5fa8', ORANGE = '#b45309', GREEN = '#1b7a4b', GREY = '#5b6877', PALE = '#eef3f8', RED = '#b3261e'
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const t = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-size="${o.size || 13}" fill="${o.fill || INK}" text-anchor="${o.anchor || 'start'}"${o.bold ? ' font-weight="700"' : ''}${o.italic ? ' font-style="italic"' : ''}>${esc(s)}</text>`
const box = (x, y, w, h, label, o = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.rx ?? 6}" fill="${o.fill || PALE}" stroke="${o.stroke || INK}" stroke-width="${o.sw || 1.5}"${o.dash ? ' stroke-dasharray="6 4"' : ''}/>` +
  (label ? [].concat(label).map((l, i, a) => t(x + w / 2, y + h / 2 + 4 + (i - (a.length - 1) / 2) * 15, l, { anchor: 'middle', size: o.size || 13, fill: o.text })).join('') : '')
const line = (x1, y1, x2, y2, o = {}) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.stroke || INK}" stroke-width="${o.sw || 1.5}"${o.dash ? ' stroke-dasharray="6 4"' : ''}${o.arrow ? ' marker-end="url(#arrow)"' : ''}/>`
const circ = (x, y, r, o = {}) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${o.fill || 'none'}" stroke="${o.stroke || INK}" stroke-width="${o.sw || 1.5}"${o.dash ? ' stroke-dasharray="5 4"' : ''}/>`
const path = (d, o = {}) => `<path d="${d}" fill="${o.fill || 'none'}" stroke="${o.stroke || INK}" stroke-width="${o.sw || 1.5}"${o.dash ? ' stroke-dasharray="6 4"' : ''}${o.arrow ? ' marker-end="url(#arrow)"' : ''}/>`

function svg(id, title, desc, body) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 380" width="640" height="380" role="img" aria-labelledby="t d" font-family="system-ui, -apple-system, 'Segoe UI', Arial, sans-serif">
<title id="t">${esc(title)}</title>
<desc id="d">${esc(desc)}</desc>
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${INK}"/></marker></defs>
<rect x="0.75" y="0.75" width="638.5" height="378.5" rx="10" fill="#ffffff" stroke="${GREY}" stroke-width="1.5"/>
${t(16, 24, 'DIAGRAM · original explanatory illustration, not a photograph', { size: 11, fill: GREY, bold: true })}
${t(16, 48, title, { size: 17, bold: true })}
${body}
</svg>
`
  writeFileSync(OUT + id + '.svg', xml)
}

// 1 holobox-inline-layout
svg('holobox-inline-layout', 'In-line holography layout (proposed)',
  'Left to right: a light source with a pinhole, a collimated beam, an opaque strip object, a gap labelled z, and an image sensor. Light passing around the strip is the reference wave and light scattered by it is the object wave.',
  [
    box(24, 150, 90, 70, ['Light source', '+ pinhole']),
    line(114, 185, 230, 185, { arrow: true, stroke: ORANGE, sw: 3 }),
    t(172, 170, 'collimated beam', { anchor: 'middle', size: 12, fill: ORANGE }),
    `<rect x="236" y="150" width="14" height="70" fill="${INK}"/>`,
    t(243, 240, 'opaque strip', { anchor: 'middle', size: 12 }),
    t(243, 256, '(width w)', { anchor: 'middle', size: 12 }),
    line(250, 168, 520, 168, { stroke: ORANGE, dash: true }),
    line(250, 202, 520, 202, { stroke: ORANGE, dash: true }),
    path('M250 185 Q380 130 520 150', { stroke: BLUE, dash: true }),
    path('M250 185 Q380 240 520 220', { stroke: BLUE, dash: true }),
    t(380, 128, 'scattered: object wave', { anchor: 'middle', size: 12, fill: BLUE }),
    t(380, 280, 'unscattered: reference wave (orange)', { anchor: 'middle', size: 12, fill: ORANGE }),
    box(520, 140, 18, 90, '', { fill: INK }),
    t(529, 255, 'image sensor', { anchor: 'middle', size: 12 }),
    t(529, 271, '(pixel pitch p)', { anchor: 'middle', size: 12 }),
    line(250, 310, 520, 310, { arrow: true }), line(520, 310, 250, 310, { arrow: true }),
    t(385, 330, 'distance z (read from the rail scale)', { anchor: 'middle', size: 13, bold: true }),
    t(24, 360, 'The sensor records interference intensity only; a computer propagates it numerically.', { size: 12, fill: GREY }),
  ].join('\n'))

// 2 holobox-sampling-vs-aperture
svg('holobox-sampling-vs-aperture', 'Sampling limit versus aperture limit',
  'Two panels. Left: a row of sensor pixels with a fringe whose period is under two pixels, marked as aliased. Right: a cone from the object to the sensor edge showing the geometric numerical aperture set by the window half-width and the distance z.',
  [
    t(20, 78, 'A. Sampling limit (pixels)', { bold: true }),
    ...Array.from({ length: 10 }, (_, i) => box(20 + i * 28, 150, 28, 28, '', { rx: 0, fill: '#ffffff' })),
    path('M20 128 Q34 108 48 128 T76 128 T104 128 T132 128 T160 128 T188 128 T216 128 T244 128 T272 128 T300 128', { stroke: RED, sw: 2 }),
    t(150, 100, 'fringe period < 2 pixels', { anchor: 'middle', size: 12, fill: RED }),
    t(150, 205, 'aliased: cannot be recorded', { anchor: 'middle', size: 12, fill: RED }),
    t(150, 225, 'Lambda >= 2p  =>  NA(pix) = lambda / 2p', { anchor: 'middle', size: 12 }),
    line(320, 70, 320, 340, { stroke: GREY, dash: true }),
    t(340, 78, 'B. Aperture limit (window)', { bold: true }),
    circ(360, 200, 5, { fill: INK }),
    t(360, 224, 'object', { anchor: 'middle', size: 12 }),
    line(360, 200, 560, 130, { stroke: BLUE, sw: 2 }), line(360, 200, 560, 270, { stroke: BLUE, sw: 2 }),
    box(556, 125, 12, 150, '', { fill: INK }),
    line(580, 130, 580, 200, { arrow: true }), line(580, 200, 580, 130, { arrow: true }),
    t(598, 168, 'W', { size: 13, bold: true }),
    line(360, 300, 560, 300, { arrow: true }), line(560, 300, 360, 300, { arrow: true }),
    t(460, 320, 'distance z', { anchor: 'middle', size: 13, bold: true }),
    t(470, 245, 'NA(geo) = W / sqrt(z^2 + W^2)', { anchor: 'middle', size: 12, fill: BLUE }),
    t(20, 360, 'Effective NA is the smaller of the two; smallest period is about lambda / NA.', { size: 12, fill: GREY }),
  ].join('\n'))

// 3 tinylev-two-cap-geometry
{
  const Rr = 130, cy = 215
  const pts = sign => [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9].map(a => [320 + Rr * Math.sin(a), cy - sign * Rr * Math.cos(a)])
  const arc = sign => path(`M${320 + Rr * Math.sin(-1)} ${cy - sign * Rr * Math.cos(-1)} A${Rr} ${Rr} 0 0 ${sign > 0 ? 1 : 0} ${320 + Rr * Math.sin(1)} ${cy - sign * Rr * Math.cos(1)}`, { stroke: GREY })
  const ex = 320 + Rr * Math.sin(0.9), ey = cy - Rr * Math.cos(0.9)
  svg('tinylev-two-cap-geometry', 'Two opposed emitter caps and the common axis',
    'Cross-section: two curved caps of small circles (emitters) face each other above and below a vertical dashed axis. The centre is marked, with the cap radius R and polar angle theta drawn for one emitter. A bead is shown at a pressure node on the axis.',
    [
      line(320, 66, 320, 366, { dash: true, stroke: GREY }),
      t(332, 76, 'common axis z', { size: 12, fill: GREY }),
      arc(1), arc(-1),
      ...pts(1).map(([x, y]) => circ(x, y, 7, { fill: ORANGE, sw: 1 })),
      ...pts(-1).map(([x, y]) => circ(x, y, 7, { fill: ORANGE, sw: 1 })),
      circ(320, cy, 4, { fill: INK }), t(332, cy + 16, 'centre', { size: 12 }),
      circ(320, cy - 20, 6, { fill: '#ffffff', stroke: BLUE, sw: 2 }),
      t(150, cy - 22, 'bead at a pressure node', { size: 12, fill: BLUE }),
      line(320, cy, ex, ey, { stroke: INK }), t((320 + ex) / 2 + 12, (cy + ey) / 2 + 6, 'R', { size: 14, bold: true }),
      path(`M320 ${cy - 40} A40 40 0 0 1 ${320 + 40 * Math.sin(0.9)} ${cy - 40 * Math.cos(0.9)}`, { stroke: GREEN }),
      t(352, cy - 50, 'theta', { size: 12, fill: GREEN }),
      t(24, 120, 'upper cap (phase 0)', { size: 12 }), t(24, 330, 'lower cap (phase offset)', { size: 12 }),
      t(24, 372, 'Axial fields add as phasors; random phase or position errors shift and weaken the node.', { size: 12, fill: GREY }),
    ].join('\n'))
}

// 4 tinylev-phase-error-pressure
svg('tinylev-phase-error-pressure', 'Effect of phase errors on the axial pressure (schematic)',
  'Two sketched curves of squared pressure against height z. The upper curve has deep regular dips at the nodes. The lower curve has shallower, slightly shifted dips, labelled with phase errors.',
  [
    t(24, 84, 'No errors', { bold: true, fill: GREEN }),
    line(60, 180, 600, 180, { stroke: GREY }), line(60, 100, 60, 180, { stroke: GREY }),
    path('M60 110 C90 110 100 176 120 176 C140 176 150 110 180 110 C210 110 220 176 240 176 C260 176 270 110 300 110 C330 110 340 176 360 176 C380 176 390 110 420 110 C450 110 460 176 480 176 C500 176 510 110 540 110 C570 110 580 176 600 176', { stroke: GREEN, sw: 2.5 }),
    t(120, 196, 'node', { anchor: 'middle', size: 12 }),
    t(24, 234, 'With phase and position errors', { bold: true, fill: RED }),
    line(60, 330, 600, 330, { stroke: GREY }), line(60, 250, 60, 330, { stroke: GREY }),
    path('M60 270 C90 262 102 316 126 312 C146 308 152 274 184 270 C214 266 224 312 246 310 C266 308 272 276 306 268 C336 262 346 310 368 312 C388 314 394 272 426 266 C456 262 466 316 488 314 C508 312 514 276 546 270 C574 266 584 312 600 316', { stroke: RED, sw: 2.5 }),
    t(126, 350, 'shallower, shifted node', { anchor: 'middle', size: 12, fill: RED }),
    t(600, 98, 'z', { size: 13, bold: true }), t(600, 248, 'z', { size: 13, bold: true }),
    t(24, 372, 'Schematic only. Run the simulation for numbers.', { size: 12, fill: GREY }),
  ].join('\n'))

// 5 racecar-sensor-fusion-flow
svg('racecar-sensor-fusion-flow', 'Sensor and estimator flow (proposed)',
  'Flow diagram: wheel encoders and a heading-rate sensor feed a dead-reckoning block. A LiDAR scan feeds a map-match block that outputs an absolute position fix, which can drop out. Both go into a correction block that outputs the position estimate, which is compared with surveyed ground-truth marks to give the error.',
  [
    box(24, 90, 130, 44, ['Wheel encoders']), box(24, 146, 130, 44, ['Heading-rate sensor']),
    box(200, 108, 140, 64, ['Dead reckoning', '(drifts)']),
    line(154, 112, 200, 128, { arrow: true }), line(154, 168, 200, 152, { arrow: true }),
    box(24, 250, 130, 44, ['2D LiDAR scan']), box(200, 250, 140, 44, ['Map match']),
    line(154, 272, 200, 272, { arrow: true }),
    t(270, 316, 'absolute fix (can drop out)', { anchor: 'middle', size: 12, fill: ORANGE }),
    box(400, 170, 130, 70, ['Correction', 'x += K (z - x)'], { fill: '#fff7ed', stroke: ORANGE }),
    line(340, 140, 400, 195, { arrow: true }), line(340, 272, 400, 225, { arrow: true, stroke: ORANGE, dash: true }),
    box(550, 170, 76, 70, ['Position', 'estimate']),
    line(530, 205, 550, 205, { arrow: true }),
    box(400, 90, 226, 44, ['Surveyed ground-truth marks'], { fill: '#ecfdf3', stroke: GREEN }),
    line(588, 134, 588, 170, { arrow: true, stroke: GREEN }),
    t(500, 156, 'compare: error', { anchor: 'middle', size: 12, fill: GREEN }),
    t(24, 366, 'The fixed-gain correction does not estimate heading; a real filter would.', { size: 12, fill: GREY }),
  ].join('\n'))

// 6 racecar-test-floor-layout
svg('racecar-test-floor-layout', 'Surveyed floor layout (suggested; dimensions to be surveyed)',
  'Plan view of a rectangular indoor test floor with a grid of taped marks, a circular lap path of radius R, a start line, an operator station with a kill switch, and a clear safety margin around the area.',
  [
    box(40, 70, 440, 280, '', { fill: '#ffffff', dash: true, stroke: GREY }),
    t(260, 88, 'clear safety margin (no people or obstacles)', { anchor: 'middle', size: 12, fill: GREY }),
    box(70, 100, 380, 220, '', { fill: PALE }),
    ...[0, 1, 2, 3, 4].flatMap(i => [0, 1, 2, 3].map(j => `<path d="M${100 + i * 80 - 4} ${130 + j * 60} h8 M${100 + i * 80} ${130 + j * 60 - 4} v8" stroke="${INK}" stroke-width="1.5"/>`)),
    circ(260, 210, 75, { stroke: BLUE, sw: 2.5 }),
    line(260, 210, 335, 210, { stroke: BLUE }), t(298, 204, 'R', { size: 13, bold: true, fill: BLUE }),
    line(250, 130, 250, 150, { stroke: ORANGE, sw: 3 }), t(205, 130, 'start', { size: 12, fill: ORANGE }),
    box(500, 120, 120, 60, ['Operator +', 'kill switch'], { fill: '#fff1f0', stroke: RED }),
    t(560, 210, 'speed limit set in', { anchor: 'middle', size: 12 }), t(560, 226, 'firmware, agreed with', { anchor: 'middle', size: 12 }), t(560, 242, 'your teacher', { anchor: 'middle', size: 12 }),
    t(90, 346, '+ taped marks measured with a tape; record survey uncertainty', { size: 12 }),
    t(24, 372, 'Indoor, low-speed, supervised only.', { size: 12, fill: GREY }),
  ].join('\n'))

// 7 radar-fmcw-chain
svg('radar-fmcw-chain', 'Processing chain from chirp to range-Doppler map',
  'Block diagram: chirp generator feeds a transmit antenna. A receive antenna and mixer produce a beat signal that is sampled. A range FFT along each chirp is followed by a Doppler FFT across chirps to give a range-Doppler map with a peak at the target.',
  [
    box(24, 90, 110, 50, ['Chirp', 'generator']), box(170, 90, 110, 50, ['Transmit', 'antenna']),
    line(134, 115, 170, 115, { arrow: true }),
    circ(340, 115, 6, { fill: INK }), t(340, 146, 'target (R, v)', { anchor: 'middle', size: 12 }),
    line(280, 108, 334, 114, { dash: true, stroke: ORANGE, arrow: true }),
    box(420, 90, 110, 50, ['Receive', 'antenna']), line(346, 114, 420, 108, { dash: true, stroke: ORANGE, arrow: true }),
    box(24, 200, 110, 50, ['Mixer', '(beat tone)'], { fill: '#fff7ed', stroke: ORANGE }), line(475, 140, 475, 170, { stroke: INK }), line(475, 170, 80, 170, { stroke: INK }), line(80, 170, 80, 200, { arrow: true }),
    box(170, 200, 110, 50, ['Sample', '(N per chirp)']), line(134, 225, 170, 225, { arrow: true }),
    box(316, 200, 110, 50, ['Range FFT', '(each chirp)']), line(280, 225, 316, 225, { arrow: true }),
    box(462, 200, 120, 50, ['Doppler FFT', '(across M chirps)']), line(426, 225, 462, 225, { arrow: true }),
    box(400, 290, 180, 70, '', { fill: '#ffffff' }),
    ...[0, 1, 2, 3, 4, 5].flatMap(i => [0, 1, 2].map(j => `<rect x="${408 + i * 28}" y="${298 + j * 20}" width="26" height="18" fill="${i === 3 && j === 1 ? ORANGE : PALE}" stroke="${GREY}"/>`)),
    line(522, 250, 522, 290, { arrow: true }),
    t(24, 300, 'f(b) = 2BR / (cT)    range resolution = c / 2B', { size: 13 }),
    t(24, 324, 'f(d) = 2v / lambda    v(max) = lambda / 4T', { size: 13 }),
    t(490, 376, 'range-Doppler map: one peak', { anchor: 'middle', size: 12 }),
  ].join('\n'))

// 8 radar-sar-geometry
svg('radar-sar-geometry', 'Synthetic aperture geometry (optional extension)',
  'Plan view: a radar moves along a straight line of length L. Dashed lines from several positions point at a target at range R. A label shows the combined aperture is equivalent to a long antenna.',
  [
    line(80, 300, 560, 300, { sw: 3 }),
    ...[0, 1, 2, 3, 4].map(i => box(100 + i * 100, 288, 24, 24, '', { fill: ORANGE, rx: 3 }) + line(112 + i * 100, 288, 320, 110, { dash: true, stroke: BLUE })),
    circ(320, 100, 8, { fill: INK }), t(340, 98, 'target', { size: 13 }),
    line(60, 330, 580, 330, { arrow: true }), line(580, 330, 60, 330, { arrow: true }),
    t(320, 352, 'synthetic aperture length L', { anchor: 'middle', size: 13, bold: true }),
    line(600, 100, 600, 300, { arrow: true }), line(600, 300, 600, 100, { arrow: true }),
    t(606, 205, 'R', { size: 14, bold: true }),
    t(320, 70, 'cross-range resolution ~ lambda R / 2L', { anchor: 'middle', size: 13, fill: BLUE }),
    t(60, 280, 'radar positions (phase kept)', { size: 12, fill: ORANGE }),
  ].join('\n'))

// 9 prandtl-twist-jig
svg('prandtl-twist-jig', 'Measuring wing twist in a jig (suggested)',
  'Side view of a flat wing resting on a block at the root and another block at the tip with a thin wedge. A digital angle gauge on top of the wing at the root and at the tip reads two different angles, giving the tip twist.',
  [
    line(40, 300, 600, 300, { sw: 2, stroke: GREY }),
    box(90, 252, 70, 48, 'root block', { fill: '#f1f5f9', size: 11 }),
    box(480, 252, 70, 48, 'tip block', { fill: '#f1f5f9', size: 11 }),
    `<path d="M520 252 L550 252 L550 240 Z" fill="${ORANGE}" stroke="${INK}"/>`,
    t(560, 244, 'wedge', { size: 12, fill: ORANGE }),
    `<path d="M100 252 L540 240 L540 232 L100 244 Z" fill="#fde68a" stroke="${INK}" stroke-width="1.5"/>`,
    box(110, 214, 60, 28, 'gauge', { fill: '#ffffff', size: 11 }), t(140, 206, 'angle at root', { anchor: 'middle', size: 12 }),
    box(450, 196, 60, 28, 'gauge', { fill: '#ffffff', size: 11 }), t(480, 188, 'angle at tip', { anchor: 'middle', size: 12 }),
    t(320, 110, 'twist = angle(tip) - angle(root)', { anchor: 'middle', size: 15, bold: true }),
    t(320, 134, 'negative = washout (tip at lower angle of attack)', { anchor: 'middle', size: 13, fill: GREEN }),
    t(24, 360, 'Record the gauge reading uncertainty; re-check before every flight session.', { size: 12, fill: GREY }),
  ].join('\n'))

// 10 prandtl-lift-distribution
svg('prandtl-lift-distribution', 'Spanwise lift distributions (schematic)',
  'Graph with half-span on the horizontal axis and relative loading on the vertical axis. An elliptical curve is drawn solid, and a flatter curve with lower loading near the tip is drawn dashed and labelled with washout.',
  [
    line(80, 320, 580, 320, { stroke: GREY }), line(80, 320, 80, 90, { stroke: GREY }),
    t(330, 350, 'distance from centreline  (y / semi-span)', { anchor: 'middle', size: 12 }),
    t(70, 86, 'load', { anchor: 'end', size: 12 }),
    path('M80 120 A500 200 0 0 1 580 320', { stroke: BLUE, sw: 3 }),
    path('M80 140 C200 138 300 160 400 230 C470 280 540 306 580 320', { stroke: ORANGE, sw: 3, dash: true }),
    t(430, 150, 'elliptical (reference)', { size: 13, fill: BLUE }),
    t(430, 200, 'with washout: less load at the tip', { size: 13, fill: ORANGE }),
    t(80, 340, '0', { anchor: 'middle', size: 12 }), t(580, 340, '1', { anchor: 'middle', size: 12 }),
    t(24, 372, 'Schematic only; use the simulation for numbers.', { size: 12, fill: GREY }),
  ].join('\n'))

// 11 cansat-ground-test-layout
svg('cansat-ground-test-layout', 'Surveyed ground test (no launch)',
  'Plan view of an open field with a tracking antenna on a tripod at one end and a row of numbered stakes at increasing distances along a measured line. A second arc of stakes at one fixed distance shows angular offsets. The transmitter is held at each stake in turn.',
  [
    box(30, 70, 580, 280, '', { fill: '#f7fbf4', dash: true, stroke: GREEN }),
    `<path d="M60 210 l16 -28 l16 28 z" fill="${INK}"/>`, t(76, 232, 'tracking antenna', { anchor: 'middle', size: 12 }),
    line(92, 210, 540, 210, { stroke: GREY, dash: true }),
    ...[1, 2, 3, 4, 5, 6].map(i => circ(92 + i * 70, 210, 6, { fill: ORANGE }) + t(92 + i * 70, 236, String(i), { anchor: 'middle', size: 12 })),
    t(330, 262, 'stakes at measured distances d1 ... d6 (tape or survey wheel)', { anchor: 'middle', size: 12 }),
    path(`M${92 + 168 * Math.cos(0.6)} ${210 - 168 * Math.sin(0.6)} A168 168 0 0 1 ${92 + 168 * Math.cos(0.6)} ${210 + 168 * Math.sin(0.6)}`, { stroke: BLUE, dash: true }),
    ...[-1, 0, 1].map(k => circ(92 + 168 * Math.cos(k * 0.45), 210 - 168 * Math.sin(k * 0.45), 6, { fill: BLUE })),
    t(600, 100, 'arc at one fixed distance: pointing offsets', { anchor: 'end', size: 12, fill: BLUE }),
    t(24, 372, 'Ground test only. No rocket, drone or balloon is part of this project.', { size: 12, fill: RED, bold: true }),
  ].join('\n'))

// 12 cansat-link-budget-chain
svg('cansat-link-budget-chain', 'Link budget chain (decibels)',
  'Left-to-right chain: transmit power plus can antenna gain, minus free-space path loss, minus pointing loss, plus tracking antenna gain, giving received power. A bar at the end compares received power with receiver sensitivity to show the margin.',
  [
    box(20, 110, 100, 56, ['Transmit power', 'P(t)']), box(140, 110, 100, 56, ['+ can antenna', 'gain G(t)'], { fill: '#ecfdf3', stroke: GREEN }),
    box(260, 110, 110, 56, ['- free-space', 'path loss L(fs)'], { fill: '#fff1f0', stroke: RED }),
    box(390, 110, 100, 56, ['- pointing', 'loss L(p)'], { fill: '#fff1f0', stroke: RED }),
    box(510, 110, 110, 56, ['+ tracking', 'antenna gain G(r)'], { fill: '#ecfdf3', stroke: GREEN }),
    ...[120, 240, 370, 490].map(x => line(x, 138, x + 20, 138, { arrow: true })),
    box(200, 210, 240, 44, ['Received power P(r)  (dBm)'], { fill: '#e8f0fe', stroke: BLUE }),
    line(320, 166, 320, 210, { arrow: true }),
    `<rect x="120" y="290" width="400" height="22" fill="${PALE}" stroke="${GREY}"/>`,
    `<rect x="120" y="290" width="150" height="22" fill="#fecaca" stroke="${GREY}"/>`,
    `<rect x="270" y="290" width="170" height="22" fill="#bbf7d0" stroke="${GREY}"/>`,
    t(195, 306, 'below sensitivity', { anchor: 'middle', size: 11 }),
    t(355, 306, 'margin', { anchor: 'middle', size: 12, bold: true }),
    line(270, 280, 270, 322, { stroke: INK, sw: 2 }), t(270, 338, 'receiver sensitivity', { anchor: 'middle', size: 12 }),
    line(440, 280, 440, 322, { stroke: BLUE, sw: 2 }), t(440, 338, 'P(r)', { anchor: 'middle', size: 12, fill: BLUE }),
    t(24, 372, 'margin = P(r) - sensitivity; free-space loss is optimistic near the ground.', { size: 12, fill: GREY }),
  ].join('\n'))

// 13 fpm-led-pupil-shift
svg('fpm-led-pupil-shift', 'LED angle shifts the sampled region of the spectrum',
  'Left: three LEDs at different positions above a sample illuminate it at different angles toward an objective. Right: the sample spectrum drawn as a wide band with three overlapping circles of equal size, each shifted according to its LED angle.',
  [
    ...[-1, 0, 1].map(k => circ(110 + k * 70, 100, 8, { fill: ORANGE }) + line(110 + k * 70, 108, 110, 250, { stroke: ORANGE, dash: true })),
    t(110, 80, 'LED array', { anchor: 'middle', size: 12 }),
    box(70, 250, 80, 10, '', { fill: INK, rx: 2 }), t(160, 262, 'sample', { size: 12 }),
    box(85, 296, 50, 36, ['objective'], { size: 11 }),
    line(110, 260, 110, 296, { arrow: true, stroke: BLUE }),
    line(300, 70, 300, 340, { stroke: GREY, dash: true }),
    t(320, 84, 'Fourier plane (sample spectrum)', { size: 13, bold: true }),
    `<rect x="330" y="170" width="290" height="60" fill="${PALE}" stroke="${GREY}"/>`,
    circ(430, 200, 40, { stroke: BLUE, sw: 2.5 }), circ(475, 200, 40, { stroke: ORANGE, sw: 2.5, dash: true }), circ(520, 200, 40, { stroke: GREEN, sw: 2.5, dash: true }),
    t(400, 262, 'centre LED', { anchor: 'middle', size: 12, fill: BLUE }),
    t(560, 282, 'tilted LED shifts the pupil', { anchor: 'middle', size: 12, fill: GREEN }),
    line(430, 300, 520, 300, { arrow: true }), t(475, 320, 'shift k = sin(theta) / lambda', { anchor: 'middle', size: 12 }),
    t(24, 372, 'NA(synthetic) = NA(objective) + sin(theta max)', { size: 13, fill: GREY }),
  ].join('\n'))

// 14 fpm-overlap-geometry
svg('fpm-overlap-geometry', 'Two pupil circles and their overlap',
  'Two equal circles of radius R whose centres are a distance delta apart on a horizontal line. The lens-shaped intersection is shaded and labelled overlap.',
  [
    `<clipPath id="c1"><circle cx="270" cy="200" r="110"/></clipPath>`,
    `<circle cx="370" cy="200" r="110" fill="#bfdbfe" clip-path="url(#c1)"/>`,
    circ(270, 200, 110, { stroke: BLUE, sw: 2.5 }), circ(370, 200, 110, { stroke: ORANGE, sw: 2.5 }),
    circ(270, 200, 4, { fill: BLUE }), circ(370, 200, 4, { fill: ORANGE }),
    line(270, 200, 270, 90, { stroke: BLUE, dash: true }), t(258, 150, 'R', { size: 14, bold: true, fill: BLUE }),
    line(270, 320, 370, 320, { arrow: true }), line(370, 320, 270, 320, { arrow: true }),
    t(320, 342, 'delta (pupil shift)', { anchor: 'middle', size: 13, bold: true }),
    t(320, 206, 'overlap', { anchor: 'middle', size: 13, bold: true }),
    t(500, 140, 'A / (pi R^2) =', { size: 12 }), t(500, 158, '(2/pi)[acos q', { size: 12 }), t(500, 176, '  - q sqrt(1 - q^2)]', { size: 12 }),
    t(500, 202, 'q = delta / 2R', { size: 12 }),
    t(24, 372, 'How much overlap a reconstruction needs is something you test.', { size: 12, fill: GREY }),
  ].join('\n'))

console.log('written')
