const programmeNames = value => String(value ?? '')
    .replace(/Nanyang Girls(?:['’]|&rsquo;|&#8217;|&#x2019;)?\s*High School/gi, '3D design and interactive room models')
    .replace(/Bartley Secondary School/gi, 'miniature escape-room design')
    .replace(/Boon Lay Garden Primary(?: School)?/gi, 'beginner design and making')
    .replace(/\bNYGH\b/g, 'interactive room-model')
    .replace(/\bBLGPS\b/g, 'design-thinking')
export function programmePostCopy(post) {
    if (!post || post.slug !== 'school-stem-collaborations') return post
    const next = { ...post }
    for (const key of ['title', 'excerpt', 'metaTitle', 'metaDescription']) if (typeof next[key] === 'string') next[key] = programmeNames(next[key])
    for (const key of ['tags', 'categories']) if (Array.isArray(next[key])) next[key] = next[key].map(programmeNames)
    if (next.cta && typeof next.cta === 'object') {
        next.cta = { ...next.cta }
        for (const key of ['text', 'label', 'title', 'description', 'buttonText']) if (typeof next.cta[key] === 'string') next.cta[key] = programmeNames(next.cta[key])
    }
    next.metaDescription ||= next.excerpt || 'Explore practical 3D design, miniature escape-room and electronics programmes by Fix It Today.'
    return next
}
export function programmeHtmlCopy(html, slug) {
    if (slug !== 'school-stem-collaborations') return html
    // Change displayed text and accessibility labels, preserving original asset
    // URLs, links and source records. Metadata uses programmePostCopy above.
    return html.split(/(<[^>]*>)/g).map(part => part.startsWith('<')
        ? part.replace(/(\b(?:alt|title|aria-label)\s*=\s*)(["'])(.*?)\2/gi, (_, prefix, quote, value) => prefix + quote + programmeNames(value) + quote)
        : programmeNames(part)).join('')
}
