import * as holobox from './holobox.js'
import * as tinylev from './tinylev.js'
import * as racecar from './racecar.js'
import * as radar from './radar.js'
import * as prandtl from './prandtl.js'
import * as cansat from './cansat.js'
import * as fpm from './fpm.js'
import * as seismometer from './seismometer.js'
import * as spectrometer from './spectrometer.js'
import * as tomography from './tomography.js'
import { normaliseParams } from './spec.js'

export { formatValue } from './spec.js'
export { fitPathLoss, fspl } from './cansat.js'

// Each model: params (with units and limits), assumptions, caveats, run(), toRow().
// None of them holds answer-key material, so they are safe to ship to the browser.
export const SIMULATIONS = {
  holobox: { id: 'holobox', title: 'In-line hologram: sampling versus aperture', ...holobox },
  tinylev: { id: 'tinylev', title: 'Two-cap levitator: axial pressure node under errors', ...tinylev },
  racecar: { id: 'racecar', title: 'Dead reckoning versus map fixes with slip and dropout', ...racecar },
  radar: { id: 'radar', title: 'Range-Doppler processing of a synthetic target', ...radar },
  prandtl: { id: 'prandtl', title: 'Lifting-line glider: twist, efficiency and Reynolds number', ...prandtl },
  cansat: { id: 'cansat', title: 'Descent link budget and tracker pointing', ...cansat },
  fpm: { id: 'fpm', title: 'Fourier ptychography: LED overlap and reconstruction', ...fpm },
  seismometer: { id: 'seismometer', title: 'Spring-mass sensor: damping, ringing and response', ...seismometer },
  spectrometer: { id: 'spectrometer', title: 'Camera spectrometer: slit width, resolution and signal', ...spectrometer },
  tomography: { id: 'tomography', title: 'Resistor network: locating a hidden change from the boundary', ...tomography },
}

export function defaultParams(id) {
  return normaliseParams(SIMULATIONS[id].params, {})
}

export function runSimulation(id, input) {
  const sim = SIMULATIONS[id]
  if (!sim) throw new Error('Unknown simulation ' + id)
  const params = normaliseParams(sim.params, input)
  const result = sim.run(params)
  return { ...result, row: sim.toRow(result.params, result) }
}
