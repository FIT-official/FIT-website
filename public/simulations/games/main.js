import { findActivity } from '../catalog.js'
import { mountGame } from './runtime.js'

// Explicit import allowlist: only the selected game's module is downloaded.
const games = {
  'ratio-sweets-share': () => import('./ratio-sweets-share.js'),
  'ratio-paint-mix': () => import('./ratio-paint-mix.js'),
  'fractions-pizza-party': () => import('./fractions-pizza-party.js'),
  'fractions-number-line-jump': () => import('./fractions-number-line-jump.js'),
}
const id = document.body.dataset.activity
const host = document.querySelector('#app')
if (!games[id]) throw new Error('Unknown FIT game')
host.textContent = 'Opening your game…'
try {
  const { default: game } = await games[id]()
  mountGame(host, game, { model: findActivity(id).model })
} catch {
  host.textContent = 'The game could not open. Reload the page to try again.'
}
