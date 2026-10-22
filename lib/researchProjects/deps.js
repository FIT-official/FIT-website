import { randomUUID } from 'node:crypto'
import { defaultAccessDeps } from './access.js'
import { researchCollection } from './store.js'

// Production wiring. Tests and the coordinator's later membership integration inject their own.
export function defaultDeps() {
  return {
    ...defaultAccessDeps(),
    collection: researchCollection,
    now: () => new Date(),
    newId: () => randomUUID(),
  }
}
