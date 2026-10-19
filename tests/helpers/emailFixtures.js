// SYNTHETIC custom-print requests and model bytes for the idle-nudge email tests and the local email preview. Every name, id and address is invented (example.test); no real customer,
// order, file or storage object is read.
import { boxStl, cylinderStl } from './modelFixtures'

export function coneStl(radius = 12, height = 30, segments = 20) {
  const tris = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * 2 * Math.PI, b = ((i + 1) / segments) * 2 * Math.PI
    const p = ang => [Math.cos(ang) * radius, Math.sin(ang) * radius, 0]
    tris.push([p(a), p(b), [0, 0, height]], [[0, 0, 0], p(b), p(a)])
  }
  const buf = new ArrayBuffer(84 + tris.length * 50), dv = new DataView(buf); dv.setUint32(80, tris.length, true)
  tris.forEach((t, i) => t.forEach((vert, k) => vert.forEach((c, j) => dv.setFloat32(84 + i * 50 + 12 + k * 12 + j * 4, c, true))))
  return new Uint8Array(buf)
}
export { boxStl, cylinderStl }

export const OWNER = 'user_syn_owner'
export const OTHER = 'user_syn_other'

export const legacyRequest = (extra = {}) => ({
  requestId: 'FIT-SYN-0001', userId: OWNER, userEmail: 'maker@example.test', userName: 'Sam Synthetic', status: 'configured', source: 'upload',
  modelFile: { originalName: 'bracket.stl', s3Key: 'synthetic/bracket.stl', s3Url: 'https://synthetic.invalid/public/bracket.stl', fileSize: 684 },
  printConfiguration: { isConfigured: true, generic: { material: 'petg', colour: 'Orange' }, printSettings: {} },
  ...extra,
})

export const guidedRequest = (extra = {}) => ({
  requestId: 'FIT-SYN-0002', userId: OWNER, userEmail: 'maker@example.test', userName: 'Sam Synthetic', status: 'quoted', source: 'upload',
  guidedBrief: { version: 1, purpose: 'prototype', material: 'pla', colour: 'Black', quantity: 7 },
  guidedAssets: [{ assetId: 'asset-box', quantity: 2 }, { assetId: 'asset-cyl', quantity: 5 }],
  currency: 'sgd',
  ...extra,
})

export const assetsFor = (owner = OWNER) => ({
  'asset-box': { assetId: 'asset-box', ownerUserId: owner, originalName: 'box-part.stl', key: 'synthetic/private/box.stl', bucket: 'synthetic-private', byteLength: 684 },
  'asset-cyl': { assetId: 'asset-cyl', ownerUserId: owner, originalName: 'round-part.stl', key: 'synthetic/private/cyl.stl', bucket: 'synthetic-private', byteLength: 4000 },
})

/** What the byte source returns, keyed by the (synthetic) storage key. */
export const BYTES = {
  'synthetic/bracket.stl': () => boxStl(24, [1, 0.5, 0.3]),
  'synthetic/private/box.stl': () => boxStl(20, [1, 1, 0.6]),
  'synthetic/private/cyl.stl': () => cylinderStl(10, 30, 24),
  'synthetic/private/cone.stl': () => coneStl(),
}
export const byteSource = (table = BYTES) => {
  const calls = []
  const loadBytes = async storage => { calls.push(storage); const make = table[storage.key]; if (!make) throw new Error('not found'); return Buffer.from(make()) }
  return { loadBytes, calls }
}
