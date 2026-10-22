import 'server-only'
import { randomUUID } from 'node:crypto'
import { defaultAccessDeps } from './access.js'
import { researchCollection } from './store.js'
import { ownerAccessDeps } from './ownerAccess.server.js'
import { readAsset } from './assets.js'

// Production wiring. Tests and the coordinator's later membership integration inject their own.
export function defaultDeps() {
  return {
    ...ownerAccessDeps(defaultAccessDeps()),
    readAsset,
    collection: researchCollection,
    now: () => new Date(),
    newId: () => randomUUID(),
  }
}
