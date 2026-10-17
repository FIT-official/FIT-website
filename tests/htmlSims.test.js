import { describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { vetHtmlSim } from '../lib/sims/vetHtmlSim'
import { readHtmlSim, htmlSimResponse, HTML_SIM_CSP } from '../lib/classroomSimulations/htmlSimDocument'
import { htmlSims } from '../content/sims/htmlSims'
import { injectNoTapZoom } from '../lib/sims/noTapZoom'

const ok = readFileSync('tests/fixtures/html-sim-ok.html', 'utf8')

describe('single-file HTML sim vetting', () => {
  it('accepts a self-contained canvas sim', () => { expect(vetHtmlSim(ok)).toMatchObject({ ok: true, block: [] }) })
  it.each([
    ['external script', ok.replace('<script>', '<script src="https://cdn.example.com/x.js"></script><script>')],
    ['external image', ok.replace('<h1>', '<img src="//evil.example/p.gif"><h1>')],
    ['css url()', ok.replace('margin:0', "background:url('https://x.example/a.png')")],
    ['fetch', ok.replace('let n=0', "fetch('/api');let n=0")],
    ['websocket', ok.replace('let n=0', "new WebSocket('wss://x');let n=0")],
    ['eval', ok.replace('let n=0', "eval('1');let n=0")],
    ['storage', ok.replace('let n=0', "localStorage.x=1;let n=0")],
    ['nested iframe', ok.replace('<h1>', '<iframe></iframe><h1>')],
    ['form', ok.replace('<h1>', '<form></form><h1>')],
    ['no viewport', ok.replace(/<meta name="viewport"[^>]*>/, '')],
    ['PhET', ok.replace('Fixture</h1>', 'PhET</h1>')],
  ])('blocks %s', (_name, html) => { expect(vetHtmlSim(html).ok).toBe(false) })
  it('warns on a university module code in visible text', () => { expect(vetHtmlSim(ok.replace('Fixture</h1>', 'MA1511</h1>')).warn.join()).toMatch(/module code/) })
})

describe('locked-down delivery', () => {
  it('reads only safe ids and fails closed on files that no longer pass vetting', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'htmlsim-'))
    writeFileSync(path.join(dir, 'good-sim.html'), ok)
    writeFileSync(path.join(dir, 'bad-sim.html'), ok.replace('let n=0', "fetch('x');let n=0"))
    expect(readHtmlSim('good-sim', dir)).toBe(ok)
    expect(readHtmlSim('bad-sim', dir)).toBeNull()
    expect(readHtmlSim('../good-sim', dir)).toBeNull()
    expect(readHtmlSim('missing', dir)).toBeNull()
  })
  it('serves with a CSP that blocks every external load and sandboxes the document', async () => {
    const res = htmlSimResponse(ok)
    const csp = res.headers.get('Content-Security-Policy')
    expect(csp).toBe(HTML_SIM_CSP)
    for (const d of ["default-src 'none'", "connect-src 'none'", "img-src data: blob:", "form-action 'none'", "frame-ancestors 'self'", 'sandbox allow-scripts']) expect(csp).toContain(d)
    expect(csp).not.toMatch(/https?:|allow-same-origin|unsafe-eval/)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.text()).toBe(injectNoTapZoom(ok)) // the vetted file plus only the inline tap guard
  })
})

describe('registered HTML sims', () => {
  it('every entry has a vetted file, and every file is registered', () => {
    const files = readdirSync('content/sims/html').filter(f => f.endsWith('.html')).map(f => f.slice(0, -5)).sort()
    expect(htmlSims.map(s => s.id).sort()).toEqual(files)
    for (const s of htmlSims) {
      expect(vetHtmlSim(readFileSync(`content/sims/html/${s.id}.html`, 'utf8')).ok).toBe(true)
      if (s.level === 'University') expect(s.syllabusRef).toMatch(/^University, /)
      expect(JSON.stringify(s)).not.toMatch(/\b(NUS|NTU)\b|\b[A-Z]{2}\d{4}\b/)
    }
  })
})

describe('/simulations/<id> route for HTML sims', () => {
  it('serves a live HTML sim with the locked-down CSP and 404s otherwise', async () => {
    vi.resetModules()
    vi.doMock('../content/sims/htmlSims.js', () => ({ htmlSims: [{ id: 'fixture-sim', title: 'Fixture', level: 'Secondary', subject: 'Physics', topic: 'Test', concept: 'test', approach: 'A fixture.', activityPrompt: 'Play.', status: 'live', height: 640 }] }))
    vi.doMock('../lib/classroomSimulations/htmlSimDocument.js', async (orig) => { const m = await orig(); return { ...m, readHtmlSim: id => (id === 'fixture-sim' ? ok : null) } })
    const { GET } = await import('../app/simulations/[activity]/route.js')
    const res = await GET(new Request('https://fit.test/simulations/fixture-sim'), { params: Promise.resolve({ activity: 'fixture-sim' }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'none'")
    const miss = await GET(new Request('https://fit.test/simulations/nope'), { params: Promise.resolve({ activity: 'nope' }) })
    expect(miss.status).toBe(404)
    vi.doUnmock('../content/sims/htmlSims.js'); vi.doUnmock('../lib/classroomSimulations/htmlSimDocument.js')
  })
})
