// Pure: TipTap JSON document → plain text (for reading time, previews, search).
export function extractTextFromTiptap(node) {
  if (!node || typeof node !== 'object') return ''
  const parts = []
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    if (n.type === 'text' && typeof n.text === 'string') parts.push(n.text)
    if (n.type === 'htmlBlock' && typeof n.attrs?.html === 'string') {
      parts.push(n.attrs.html
        .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]*>/g, ' '))
    }
    if (Array.isArray(n.content)) n.content.forEach(walk)
  }
  walk(node)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}
