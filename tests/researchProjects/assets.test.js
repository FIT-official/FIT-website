// @vitest-environment node
// Protected lesson assets: the strict manifest, the authenticated route, and the failure modes. SYNTHETIC accounts.
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { handleAssetGet } from '@/lib/researchProjects/http'
import { ASSETS, findAsset, readAsset, ASSET_ROOT } from '@/lib/researchProjects/assets'
import { createWorld, WORLD_MEMBERS, request } from './helpers'

// `server-only` throws outside a server bundle. This narrow mock lets server modules load under test.
vi.mock('server-only', () => ({}))

const URL_FOR = id => '/api/research-projects/assets?id=' + encodeURIComponent(id)
const get = (w, id) => handleAssetGet(request('GET', URL_FOR(id)), w.deps)
const world = () => {
  const w = createWorld({ members: WORLD_MEMBERS })
  return { ...w, as: id => { w.session.userId = id } }
}

describe('who may fetch an asset', () => {
  it('refuses anonymous callers with a JSON 401 and none of the file', async () => {
    const w = world()
    for (const id of ['holobox-inline-layout', 'tomography-teacher-simulation-plot', 'not-a-real-asset']) {
      const res = await get(w, id)
      expect(res.status).toBe(401)
      expect(res.headers.get('content-type')).toMatch(/application\/json/)
      expect(res.headers.get('cache-control')).toMatch(/private, no-store/)
      expect(await res.text()).not.toMatch(/<svg|data_origin/)
    }
  })

  it('refuses a signed-in account that is neither a member nor a reviewer', async () => {
    const w = world()
    w.as('someone-with-a-clerk-login')
    const res = await get(w, 'holobox-inline-layout')
    expect(res.status).toBe(403)
    expect(await res.text()).not.toMatch(/<svg/)
  })

  it('does not reveal whether an unknown asset exists before the caller is authorised', async () => {
    const w = world()
    const real = await get(w, 'holobox-inline-layout')
    const fake = await get(w, 'no-such-asset')
    expect(await fake.text()).toBe(await real.text())
  })

  it('serves a student-role diagram to a member with private, no-store, nosniff and a sandboxing policy', async () => {
    const w = world()
    w.as('stu-a1')
    const res = await get(w, 'holobox-inline-layout')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/svg+xml')
    expect(res.headers.get('cache-control')).toMatch(/private/)
    expect(res.headers.get('cache-control')).toMatch(/no-store/)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-robots-tag')).toMatch(/noindex/)
    expect(res.headers.get('content-security-policy')).toMatch(/default-src 'none'.*sandbox/)
    expect(res.headers.get('cross-origin-resource-policy')).toBe('same-origin')
    expect(res.headers.get('content-disposition')).toMatch(/^inline; filename="holobox-inline-layout\.svg"$/)
    expect(res.headers.get('vary')).toMatch(/Cookie/)
    const body = await res.text()
    expect(body).toMatch(/^<\?xml/)
    expect(body).toContain('In-line holography layout')
  })

  it('serves CSV teaching files as attachments, byte for byte', async () => {
    const w = world()
    w.as('stu-a2')
    const res = await get(w, 'seismometer-synthetic-ringdown-csv')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/^text\/csv/)
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="synthetic_ringdown.csv"')
    const text = await res.text()
    expect(text).toBe(readFileSync(join(ASSET_ROOT, 'projects-08-10', 'seismometer-synthetic-ringdown.csv'), 'utf8'))
    expect(text.split('\n')[1]).toMatch(/^SYNTHETIC,/)
  })

  it('hides teacher-only results from members, and gives them to the review role only', async () => {
    const w = world()
    for (const id of ['tomography-teacher-simulation-plot', 'tomography-teacher-candidate-scores-csv']) {
      w.as('stu-a1')
      const denied = await get(w, id)
      expect(denied.status).toBe(404)
      const missing = await get(w, 'no-such-asset')
      expect(await denied.text()).toBe(await missing.text())
      w.as('owner-b') // a personal-work owner without review
      expect((await get(w, id)).status).toBe(404)
      w.as('owner-a') // the exact review owner
      const ok = await get(w, id)
      expect(ok.status).toBe(200)
      expect(await ok.text()).not.toBe('')
    }
    w.as('teacher-1') // reviewer without any personal work space
    expect((await get(w, 'tomography-teacher-simulation-plot')).status).toBe(200)
  })
})

describe('the manifest is the only way to a file', () => {
  const hostile = [
    '../package.json', '..%2Fpackage.json', '../../../.env', 'diagrams/holobox-inline-layout.svg', 'diagrams/../../package.json',
    'C:\\Windows\\win.ini', '/etc/passwd', '%2e%2e/%2e%2e/package.json', 'holobox-inline-layout.svg', 'HOLOBOX-INLINE-LAYOUT',
    'holobox-inline-layout\0', 'holobox-inline-layout%00.svg', '', ' ', 'a', 'x'.repeat(200), '__proto__', 'constructor', 'toString',
    'holobox-inline-layout&id=other', 'holobox-inline-layout/../x',
  ]
  it('answers every traversal and malformed id with the same 404 and no content', async () => {
    const w = world()
    w.as('owner-a')
    const baseline = await (await get(w, 'no-such-asset')).text()
    for (const id of hostile) {
      const res = await get(w, id)
      expect(res.status, JSON.stringify(id)).toBe(404)
      expect(await res.text(), JSON.stringify(id)).toBe(baseline)
    }
  })

  it('ignores extra parameters, a repeated id, a path-like query and request headers', async () => {
    const w = world()
    w.as('stu-a1')
    const res = await handleAssetGet(request('GET', '/api/research-projects/assets?id=../x&id=holobox-inline-layout&file=../../package.json&path=/etc/passwd', { headers: { 'x-original-url': '/etc/passwd' } }), w.deps)
    expect(res.status).toBe(404)
    const good = await handleAssetGet(request('GET', '/api/research-projects/assets?id=holobox-inline-layout&file=../../package.json'), w.deps)
    expect(good.status).toBe(200)
    expect(good.headers.get('content-disposition')).toContain('holobox-inline-layout.svg')
  })

  it('lists only svg and csv files, each with a hash, and never the curriculum archive or teacher sources', () => {
    expect(ASSETS.length).toBe(31)
    for (const a of ASSETS) {
      expect(a.file).not.toMatch(/\.\.|^[/\\]|:|\.zip$|\.md$|\.py$|\.json$|guide|teacher_key|answer_key/i)
      expect(a.sha256).toMatch(/^[0-9a-f]{64}$/)
    }
    expect(findAsset('fit_projects_08_10_curriculum')).toBeNull()
    expect(findAsset('guide')).toBeNull()
    expect(findAsset('teacher-key')).toBeNull()
  })

  it('refuses to serve a file whose bytes no longer match the manifest, and reports a generic 503', async () => {
    const asset = findAsset('holobox-inline-layout')
    await expect(readAsset(asset)).resolves.toBeInstanceOf(Buffer)
    await expect(readAsset({ ...asset, sha256: '0'.repeat(64) })).rejects.toThrow(/integrity/)
    await expect(readAsset({ ...asset, file: '../../package.json' })).rejects.toThrow(/escaped|integrity/)
    const w = world()
    w.as('stu-a1')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    w.deps.readAsset = async () => { throw Object.assign(new Error('ENOENT: D:\\secret\\path'), { code: 'ENOENT' }) }
    const res = await get(w, 'holobox-inline-layout')
    expect(res.status).toBe(503)
    expect(await res.text()).not.toMatch(/secret|ENOENT|D:/)
    spy.mockRestore()
  })
})
