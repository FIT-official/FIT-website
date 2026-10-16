import { mount } from './shell.js'
// Explicit allowlist: only the selected concept family's modules are downloaded.
const families = {
  ratio: () => Promise.all([import('./ratio/variants.js'), import('./ratio/game.js')]),
  differentiation: () => Promise.all([import('./differentiation/variants.js'), import('./differentiation/game.js')]),
}
const id = document.body.dataset.activity || ''
const concept = id.split('-').slice(0, -1).join('-')
const app = document.querySelector('#app')
if (!families[concept]) throw new Error('Unknown FIT simulation')
app.textContent = 'Opening your simulation…'
try {
  const [{ variants }, family] = await families[concept]()
  const v = variants.find(x => x.id === id)
  if (!v) throw new Error('Unknown variant')
  mount(app, v, family)
} catch {
  app.textContent = 'The simulation could not open. Reload the page to try again.'
}
