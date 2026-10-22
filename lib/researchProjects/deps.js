import { randomUUID } from 'node:crypto'
import { defaultAccessDeps } from './access.js'
import { researchCollection } from './store.js'
import { ownerAccessDeps } from './ownerAccess.server.js'

// Production wiring. Tests and the coordinator's later membership integration inject their own.
export function defaultDeps(request) {
  return {
    ...ownerAccessDeps(defaultAccessDeps(), request),
    collection: researchCollection,
    now: () => new Date(),
    newId: () => randomUUID(),
  }
}
