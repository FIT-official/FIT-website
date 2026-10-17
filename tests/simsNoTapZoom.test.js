import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'
import { injectNoTapZoom, NO_TAP_ZOOM_CSS, SIM_VIEWPORT, TAP_TARGETS } from '../lib/sims/noTapZoom'
import { readHtmlSim, htmlSimResponse, HTML_SIM_CSP } from '../lib/classroomSimulations/htmlSimDocument'
import { playerDocument } from '../lib/classroomSimulations/playerDocument'
import { getLiveSims } from '../lib/sims/registry'

const ZOOM_BLOCK = /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(?![.\d])/i
const guardRule = css => css.match(/:is\(([^)]*(?:\([^)]*\)[^)]*)*)\)\{touch-action:manipulation;-webkit-tap-highlight-color:transparent\}/)
const guarded = html => {
  expect(html).toContain('data-fit-no-tap-zoom')
  expect(html).toContain(NO_TAP_ZOOM_CSS)
  expect(html.match(/<meta\b[^>]*name="viewport"/gi)).toHaveLength(1)
  expect(html).toContain(`<meta name="viewport" content="${SIM_VIEWPORT}">`)
  expect(html).not.toMatch(ZOOM_BLOCK)
  // first thing in <head>, so a sim's own rules (e.g. touch-action:none on a drag canvas) still win
  expect(html.indexOf('data-fit-no-tap-zoom')).toBeLessThan(html.search(/<\/head>/i))
}

describe('mobile tap guard (no double-tap zoom on controls, page zoom kept)', () => {
  const targets = TAP_TARGETS.split(',')
  it('covers the quick-tap controls', () => {
    for (const t of ['button', '[role=button]', 'a', 'input', 'select', 'textarea', 'label', 'summary', 'canvas', 'svg', '[onclick]', '.controls', '.btn', '.stepper', '.chips']) expect(targets).toContain(t)
  })
  it('makes the whole sim document quick-tap (html, body, every element) without blocking pinch-zoom', () => {
    expect(NO_TAP_ZOOM_CSS.startsWith(':where(html,body,*){touch-action:manipulation}')).toBe(true) // zero specificity: a sim's own none/pan-y still wins
    expect(NO_TAP_ZOOM_CSS).not.toMatch(/touch-action:(auto|none)|!important[^}]*touch-action|touch-action[^;}]*!important/)
    for (const t of ['html', 'body', '*', 'p', 'h1', 'h2', 'div', 'main']) expect(targets).not.toContain(t) // the wrapper list stays scoped
    expect(NO_TAP_ZOOM_CSS + SIM_VIEWPORT).not.toMatch(/user-scalable|maximum-scale/)
  })
  it('hides the tap highlight box and mouse/touch focus outline but keeps a keyboard focus ring', () => {
    expect(NO_TAP_ZOOM_CSS).toContain('-webkit-tap-highlight-color:transparent')
    expect(NO_TAP_ZOOM_CSS).toContain(':focus:not(:focus-visible){outline:none}')
    expect(NO_TAP_ZOOM_CSS).toMatch(/:focus-visible\)?\{outline:3px solid/)
  })
  it('keeps inputs at >=16px on small screens', () => { expect(NO_TAP_ZOOM_CSS).toMatch(/@media \(max-width:820px\),\(pointer:coarse\)\{[^}]*font-size:max\(16px,1em\)!important/) })
  it('is idempotent and replaces a zoom-blocking viewport', () => {
    const once = injectNoTapZoom('<!doctype html><html><head><meta name="viewport" content="width=device-width, maximum-scale=1, user-scalable=no"></head><body></body></html>')
    guarded(once); expect(injectNoTapZoom(once)).toBe(once)
    guarded(injectNoTapZoom('<html><head></head><body><header></header></body></html>'))
  })

  const live = getLiveSims()
  it('covers every live sim kind', () => { expect([...new Set(live.map(a => a.kind ?? 'lab'))].sort()).toEqual(expect.arrayContaining(['family', 'game', 'html'])) })
  it.each(live.map(a => [a.kind ?? 'lab', a.id]))('%s sim %s is served with the guard', async (kind, id) => {
    if (kind === 'html') {
      const res = htmlSimResponse(readHtmlSim(id))
      expect(res.headers.get('Content-Security-Policy')).toBe(HTML_SIM_CSP) // sandbox and CSP unchanged
      guarded(await res.text())
    } else { guarded(playerDocument(id)); guarded(playerDocument(id, { embed: true })) }
  })

  it('site wrappers (class page, embed copy page) use the same scoped guard and a zoomable viewport', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    const rule = guardRule(css); expect(rule).not.toBeNull()
    expect(rule[1]).toBe(TAP_TARGETS)
    expect(css).toContain(':focus:not(:focus-visible){outline:none}')
    expect(css).toMatch(/font-size:max\(16px,1em\)!important/)
    expect(css).not.toMatch(/(^|[}\s,])(html|body)\s*(,[^{]*)?\{[^}]*touch-action/) // headings/descriptions outside the frame stay zoomable
    expect(css).toContain('iframe,[data-sim-frame],[data-sim-frame] *{touch-action:manipulation}')
    expect(readFileSync('components/sims/GameShellStage.jsx', 'utf8')).toMatch(/<div data-sim-frame="" className=\{styles\.stage\}/)
    expect(readFileSync('components/sims/GameShell.module.css', 'utf8')).toContain('.stage,.frame,.utilities,.progress,.levels,.score{touch-action:manipulation}')
    expect(readFileSync('app/layout.jsx', 'utf8')).toMatch(/export const viewport = \{ width: 'device-width', initialScale: 1 \}/)
  })

  it('no sim file, sim stylesheet or wrapper resets touch-action to auto', () => {
    const offenders = []
    const walk = dir => { for (const name of readdirSync(dir)) { const p = path.join(dir, name); if (statSync(p).isDirectory()) walk(p); else if (/\.(html|jsx?|mjs|css)$/.test(name) && /touch-action\s*:\s*auto/i.test(readFileSync(p, 'utf8'))) offenders.push(p) } }
    for (const dir of ['content/sims/html', 'public/simulations', 'components/sims', 'components/ClassroomSimulations', 'lib/sims']) walk(dir)
    expect(offenders).toEqual([])
  }, 30000)

  it('no source or sim file disables pinch-zoom', () => {
    const offenders = []
    const walk = dir => { for (const name of readdirSync(dir)) { const p = path.join(dir, name); if (statSync(p).isDirectory()) walk(p); else if (/\.(html|jsx?|mjs|css)$/.test(name) && ZOOM_BLOCK.test(readFileSync(p, 'utf8'))) offenders.push(p) } }
    for (const dir of ['app', 'components', 'lib', 'content', 'public/simulations']) walk(dir)
    expect(offenders).toEqual([])
  }, 60000)
})

describe('browser sim modules', () => {
  it('only import files served from public/ (labs and games 404ed when catalog.js imported content/)', () => {
    const bad = []
    const walk = dir => { for (const name of readdirSync(dir)) { const p = path.join(dir, name); if (statSync(p).isDirectory()) walk(p); else if (/\.m?js$/.test(name)) for (const m of readFileSync(p, 'utf8').matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]/g)) { const spec = m[1] || m[2]; if (spec && spec.startsWith('.') && !path.resolve(dir, spec).startsWith(path.resolve('public') + path.sep)) bad.push(`${p} -> ${spec}`) } } }
    walk('public/simulations')
    expect(bad).toEqual([])
  }, 30000)
})