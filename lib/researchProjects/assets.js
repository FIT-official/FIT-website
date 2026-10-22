import 'server-only'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

// SERVER ONLY. Strict manifest of the lesson diagrams and teaching files served by
// GET /api/research-projects/assets. Nothing outside this list can be served: the request carries an asset id
// (never a path), the id must match an entry here, and the file is read from a fixed server-side directory.
//   role 'student'  any authorised user of the library
//   role 'teacher'  the review role only (results that reveal answers)
// The directory content/researchProjects/assets is NOT under public/, so these files are never served statically.
// Deployment note: a serverless build must trace these files, for example with outputFileTracingIncludes for
// '/api/research-projects/assets' -> './content/researchProjects/assets/**'. See docs/researchProjects/HANDOFF.md.
// To regenerate the hashes after editing a file, run scripts/researchProjects/asset-manifest.mjs.

export const ASSET_ROOT = path.join(process.cwd(), 'content', 'researchProjects', 'assets')

export const ASSET_TYPES = {
  svg: { mime: 'image/svg+xml', disposition: 'inline' },
  csv: { mime: 'text/csv; charset=utf-8', disposition: 'attachment' },
}

export const ASSETS = Object.freeze([
  { id: 'cansat-ground-test-layout', file: 'diagrams/cansat-ground-test-layout.svg', kind: 'svg', role: 'student', filename: 'cansat-ground-test-layout.svg', bytes: 3456, sha256: '9303587ae20124e34327f0f770709dbecfb4f7444b2583f665dcefc9c9056573' },
  { id: 'cansat-link-budget-chain', file: 'diagrams/cansat-link-budget-chain.svg', kind: 'svg', role: 'student', filename: 'cansat-link-budget-chain.svg', bytes: 4272, sha256: '7221b70a67851bf953012d57a07101efa0b98a942530286ea967596f1553913b' },
  { id: 'fpm-led-pupil-shift', file: 'diagrams/fpm-led-pupil-shift.svg', kind: 'svg', role: 'student', filename: 'fpm-led-pupil-shift.svg', bytes: 3461, sha256: '319dab932c457195257e8f845f16afc887784e19bbc9be9e958966dd365beea4' },
  { id: 'fpm-overlap-geometry', file: 'diagrams/fpm-overlap-geometry.svg', kind: 'svg', role: 'student', filename: 'fpm-overlap-geometry.svg', bytes: 2690, sha256: 'd44e4f0369b1c236fa5bd19e86efe3a59e589e92c1fbcab688c322e17c15f6f2' },
  { id: 'holobox-inline-layout', file: 'diagrams/holobox-inline-layout.svg', kind: 'svg', role: 'student', filename: 'holobox-inline-layout.svg', bytes: 3312, sha256: '60875ec9101018f5a7e57cd0cafad131c4affb6186b22bcfc3f3cbfadf0258ce' },
  { id: 'holobox-sampling-vs-aperture', file: 'diagrams/holobox-sampling-vs-aperture.svg', kind: 'svg', role: 'student', filename: 'holobox-sampling-vs-aperture.svg', bytes: 4378, sha256: '51920a60f1a0964f419f468538e39230d2fc69fb6ac96eb70c0f2be9d598d57a' },
  { id: 'prandtl-lift-distribution', file: 'diagrams/prandtl-lift-distribution.svg', kind: 'svg', role: 'student', filename: 'prandtl-lift-distribution.svg', bytes: 2221, sha256: '7e44ee6343a0fd1f51917cec641a4057078a541ef77a15e492a4d376f0642b7f' },
  { id: 'prandtl-twist-jig', file: 'diagrams/prandtl-twist-jig.svg', kind: 'svg', role: 'student', filename: 'prandtl-twist-jig.svg', bytes: 2844, sha256: '16d33a47247dd36968139ab4eb0f430d050db8aa6a3f00dcb9803d0683fab6e9' },
  { id: 'racecar-sensor-fusion-flow', file: 'diagrams/racecar-sensor-fusion-flow.svg', kind: 'svg', role: 'student', filename: 'racecar-sensor-fusion-flow.svg', bytes: 4212, sha256: '8d00c5bc846d6f45202a9a95b80a4549c43af9e875f4141bfb12b62b84630314' },
  { id: 'racecar-test-floor-layout', file: 'diagrams/racecar-test-floor-layout.svg', kind: 'svg', role: 'student', filename: 'racecar-test-floor-layout.svg', bytes: 4215, sha256: '2389ee4a48663b842291861a0ed55f0d391db2c7d7045698f8f9112318443d47' },
  { id: 'radar-fmcw-chain', file: 'diagrams/radar-fmcw-chain.svg', kind: 'svg', role: 'student', filename: 'radar-fmcw-chain.svg', bytes: 6293, sha256: 'cd0fab2bd2e1626f8b083b7dd4cd9a6493bc705f09479d840dff029e458bb4ac' },
  { id: 'radar-sar-geometry', file: 'diagrams/radar-sar-geometry.svg', kind: 'svg', role: 'student', filename: 'radar-sar-geometry.svg', bytes: 3275, sha256: '27d4be84295f9f121fe8c011d3fc6348d8cf0e4fdbc2ff8436f3666d2551dc99' },
  { id: 'tinylev-phase-error-pressure', file: 'diagrams/tinylev-phase-error-pressure.svg', kind: 'svg', role: 'student', filename: 'tinylev-phase-error-pressure.svg', bytes: 2780, sha256: 'fa3192232ecd8fb5eb4646b88a90d5aaa4d10022a78fcf215e7bf507c92635e9' },
  { id: 'tinylev-two-cap-geometry', file: 'diagrams/tinylev-two-cap-geometry.svg', kind: 'svg', role: 'student', filename: 'tinylev-two-cap-geometry.svg', bytes: 4347, sha256: '68f1f941628fe43c9a6683e80a9646959e8971e6984e9299cdc5fb6bf74a4d67' },
  { id: 'seismometer-build-diagram', file: 'projects-08-10/seismometer-build-diagram.svg', kind: 'svg', role: 'student', filename: 'build_diagram.svg', bytes: 48805, sha256: 'be9712896a55afead0da7ca4573f0333124d5f7d3522fc4b6aba7442532e3654' },
  { id: 'seismometer-measurement-template-csv', file: 'projects-08-10/seismometer-measurement-template.csv', kind: 'csv', role: 'student', filename: 'measurement_template.csv', bytes: 137, sha256: 'b3701da12963bece6660c467b8449b47b917774a492e8604e50c3bfcbf77a82a' },
  { id: 'seismometer-simulation-plot', file: 'projects-08-10/seismometer-simulation-plot.svg', kind: 'svg', role: 'student', filename: 'simulation_plot.svg', bytes: 49112, sha256: 'e79b4b3ed1340ddc59f69a4c9e8f27fbc723fb616c785d2217267755d7c8d350' },
  { id: 'seismometer-synthetic-frequency-response-csv', file: 'projects-08-10/seismometer-synthetic-frequency-response.csv', kind: 'csv', role: 'student', filename: 'synthetic_frequency_response.csv', bytes: 1221, sha256: '00025cb3d5d31bc17862dba6db190314b6e0ffff5c3b49c295db761406cd38e1' },
  { id: 'seismometer-synthetic-ringdown-csv', file: 'projects-08-10/seismometer-synthetic-ringdown.csv', kind: 'csv', role: 'student', filename: 'synthetic_ringdown.csv', bytes: 131981, sha256: '28b63b0d2d8e1c2aa2c0fac42322f0a22c7b7d618e5a6db9dcf7953accd81dc9' },
  { id: 'spectrometer-build-diagram', file: 'projects-08-10/spectrometer-build-diagram.svg', kind: 'svg', role: 'student', filename: 'build_diagram.svg', bytes: 47134, sha256: '694df4a3f8f38baefc9aa523191ffda1401b0d0b1fbde0d21148aadef68bd35a' },
  { id: 'spectrometer-measurement-template-csv', file: 'projects-08-10/spectrometer-measurement-template.csv', kind: 'csv', role: 'student', filename: 'measurement_template.csv', bytes: 167, sha256: 'c7f3ee5a3e27ca62e83718deae3a8a1d857dbc76124f1fe265d3d3279dfa5fb5' },
  { id: 'spectrometer-simulation-plot', file: 'projects-08-10/spectrometer-simulation-plot.svg', kind: 'svg', role: 'student', filename: 'simulation_plot.svg', bytes: 52166, sha256: '3cc69bc3504149e99520615fb92acb8040824c2e02c713bcee9a98b1bcff75f5' },
  { id: 'spectrometer-synthetic-calibration-csv', file: 'projects-08-10/spectrometer-synthetic-calibration.csv', kind: 'csv', role: 'student', filename: 'synthetic_calibration.csv', bytes: 121, sha256: '8fee2b014848dc0074467e68edd9b1387c33406be4c21ddc02198f0fdeb14de6' },
  { id: 'spectrometer-synthetic-spectra-csv', file: 'projects-08-10/spectrometer-synthetic-spectra.csv', kind: 'csv', role: 'student', filename: 'synthetic_spectra.csv', bytes: 68598, sha256: '0b603c0ed2135ca1cb5a167bb17396a88c0d06bf53d1008d39d0e577fa2d61b2' },
  { id: 'tomography-build-diagram', file: 'projects-08-10/tomography-build-diagram.svg', kind: 'svg', role: 'student', filename: 'build_diagram.svg', bytes: 82830, sha256: '7280c136151f45be5263930d6365089522a2ec909fa12ae2a6f176657fbef5c7' },
  { id: 'tomography-measurement-template-csv', file: 'projects-08-10/tomography-measurement-template.csv', kind: 'csv', role: 'student', filename: 'measurement_template.csv', bytes: 152, sha256: '740facfffbc1a03edf5d7ac0654fbab2f9a215f913f66480c4d7bd62ab7783bd' },
  { id: 'tomography-network-edges-csv', file: 'projects-08-10/tomography-network-edges.csv', kind: 'csv', role: 'student', filename: 'network_edges.csv', bytes: 193, sha256: '575b80bb102cdc27f3c1114651289809781d1d49711d60463e341ecd86eb7867' },
  { id: 'tomography-synthetic-boundary-readings-csv', file: 'projects-08-10/tomography-synthetic-boundary-readings.csv', kind: 'csv', role: 'student', filename: 'synthetic_boundary_readings.csv', bytes: 1319, sha256: 'eb6171edd1fad3a1be25a16768043622b6bdf5aa694bf3c92568fe2b15ab8073' },
  { id: 'tomography-synthetic-candidate-fingerprints-csv', file: 'projects-08-10/tomography-synthetic-candidate-fingerprints.csv', kind: 'csv', role: 'student', filename: 'synthetic_candidate_fingerprints.csv', bytes: 12696, sha256: '1a4442f83059990704931433c5bb8c4667c1299cc31dbcd5c896a58444021c68' },
  { id: 'tomography-teacher-candidate-scores-csv', file: 'projects-08-10/tomography-teacher-candidate-scores.csv', kind: 'csv', role: 'teacher', filename: 'teacher_candidate_scores.csv', bytes: 357, sha256: '5f599e006469c81bef65270ec79dd93dca9691cd4c277061905d2b93bc840415' },
  { id: 'tomography-teacher-simulation-plot', file: 'projects-08-10/tomography-teacher-simulation-plot.svg', kind: 'svg', role: 'teacher', filename: 'teacher_simulation_plot.svg', bytes: 41039, sha256: 'b51f2482e31d2460b47bb5fbc79ab0b7d1657fd324986988772b863bdb7383fb' },
])

const BY_ID = new Map(ASSETS.map(a => [a.id, a]))
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,90}$/

export function findAsset(id) {
  return typeof id === 'string' && ID_PATTERN.test(id) ? BY_ID.get(id) || null : null
}

// Reads one manifest file and refuses to serve it if its hash no longer matches the manifest.
export async function readAsset(asset, root = ASSET_ROOT) {
  const full = path.join(root, asset.file)
  if (!full.startsWith(path.join(root) + path.sep)) throw new Error('Asset path escaped the asset root')
  const buffer = await readFile(full)
  if (buffer.length !== asset.bytes || createHash('sha256').update(buffer).digest('hex') !== asset.sha256) {
    throw new Error('Asset failed its integrity check: ' + asset.id)
  }
  return buffer
}

export { assetUrl } from './shared.js'
