import 'katex/dist/katex.min.css'
import { parseRich, safeRenderTex } from '@/lib/researchProjects/richText'

// Renders prose with `$...$` maths through KaTeX (visual HTML plus MathML for assistive technology).
// If a formula cannot be rendered the reader sees "[equation unavailable]", never the raw TeX.
export function Formula({ tex, display = false }) {
  const html = safeRenderTex(tex, display)
  const Tag = display ? 'div' : 'span'
  if (html === null) return <Tag role="img" aria-label="Equation could not be displayed">[equation unavailable]</Tag>
  return <Tag data-math={display ? 'display' : 'inline'} dangerouslySetInnerHTML={{ __html: html }} />
}

export default function RichText({ text }) {
  let segments
  try {
    segments = parseRich(text)
  } catch {
    return <span role="img" aria-label="Text could not be displayed">[text unavailable]</span>
  }
  return segments.map((s, i) => (s.type === 'math'
    ? <Formula key={i} tex={s.value} display={s.display} />
    : <span key={i}>{s.value}</span>))
}
