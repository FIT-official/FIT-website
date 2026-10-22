import katex from 'katex'

// Content strings mix prose and TeX. `$...$` is inline maths, `$$...$$` is display maths,
// and `\$` is a literal dollar sign. Student views render maths through KaTeX (HTML for
// sight, MathML for assistive technology); raw TeX is never shown.

export function parseRich(input) {
  const text = String(input ?? '')
  const segments = []
  let buffer = ''
  const flush = () => {
    if (buffer) segments.push({ type: 'text', value: buffer })
    buffer = ''
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\\' && text[i + 1] === '$') {
      buffer += '$'
      i++
    } else if (ch === '$') {
      const display = text[i + 1] === '$'
      const open = display ? 2 : 1
      const marker = display ? '$$' : '$'
      let end = -1
      for (let j = i + open; j < text.length; j++) {
        if (text[j] === '\\') { j++; continue }
        if (text.startsWith(marker, j)) { end = j; break }
      }
      if (end < 0) throw new Error('Unbalanced $ in: ' + text.slice(0, 60))
      flush()
      segments.push({ type: 'math', value: text.slice(i + open, end), display })
      i = end + open - 1
    } else buffer += ch
  }
  flush()
  return segments
}

export function renderTex(tex, display = false, strict = false) {
  return katex.renderToString(tex, {
    displayMode: display,
    throwOnError: true,
    output: 'htmlAndMathml',
    strict: strict ? 'error' : 'ignore',
    trust: false,
    maxExpand: 200,
  })
}

// Safe wrapper for components: returns an HTML string, or null if KaTeX rejects the input.
export function safeRenderTex(tex, display = false) {
  try {
    return renderTex(tex, display)
  } catch {
    return null
  }
}

// Plain-language label for an equation, used if rendering ever fails.
export function plainTextOf(input) {
  return parseRich(input).map(s => (s.type === 'text' ? s.value : '[equation]')).join('')
}
