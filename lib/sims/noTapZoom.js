// Mobile tap guard.
// Inside every served sim DOCUMENT (the iframe content) the whole sim is the quick-tap area: html, body and every
// element get touch-action:manipulation (no double-tap zoom; pinch-zoom still works, never user-scalable/max scale).
// It sits first in <head> with zero-specificity selectors, so a sim's own stricter value (none / pan-y on a drag
// canvas) still wins. On the site wrapper pages (app/globals.css) only the frame and controls get it, so headings
// and descriptions outside the frame stay double-tap zoomable.
export const SIM_VIEWPORT = 'width=device-width,initial-scale=1'

export const TAP_TARGETS = 'button,[role=button],a,input,select,textarea,label,summary,canvas,svg,[onclick],[role=slider],[role=tab],[role=radio],[role=checkbox],[tabindex],.controls,.control,.btn,.stepper,.chips,.chip,.toolbar'

export const NO_TAP_ZOOM_CSS = ':where(html,body,*){touch-action:manipulation}' +
  `:is(${TAP_TARGETS}){touch-action:manipulation;-webkit-tap-highlight-color:transparent}` +
  ':focus:not(:focus-visible){outline:none}:where(:focus-visible){outline:3px solid #1F66E5;outline-offset:2px}' +
  '@media (max-width:820px),(pointer:coarse){input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=color]),select,textarea{font-size:max(16px,1em)!important}}'

const STYLE_TAG = `<style data-fit-no-tap-zoom>${NO_TAP_ZOOM_CSS}</style>`
const VIEWPORT_TAG = `<meta name="viewport" content="${SIM_VIEWPORT}">`
const VIEWPORT_META = /<meta\b[^>]*\bname\s*=\s*["']?viewport["']?[^>]*>/i

// Injects the guard right after <head> (so a sim's own rules, e.g. touch-action:none on a drag canvas, still win)
// and normalises the viewport meta to width=device-width,initial-scale=1.
export function injectNoTapZoom(html) {
  if (typeof html !== 'string' || html.includes('data-fit-no-tap-zoom')) return html
  const hadViewport = VIEWPORT_META.test(html)
  const out = hadViewport ? html.replace(VIEWPORT_META, VIEWPORT_TAG) : html
  const tags = (hadViewport ? '' : VIEWPORT_TAG) + STYLE_TAG
  const head = /<head\b[^>]*>/i.exec(out)
  if (head) return out.slice(0, head.index + head[0].length) + tags + out.slice(head.index + head[0].length)
  const htmlTag = /<html\b[^>]*>/i.exec(out)
  if (htmlTag) return out.slice(0, htmlTag.index + htmlTag[0].length) + `<head>${tags}</head>` + out.slice(htmlTag.index + htmlTag[0].length)
  return `<!doctype html><head>${tags}</head>` + out.replace(/^\s*<!doctype html>/i, '')
}