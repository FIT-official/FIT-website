// @vitest-environment node
import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import { importPublicModel } from '@/lib/modelImport'
import { validateModelResponse } from '@/lib/modelImport/file'

const obj = Buffer.from('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n')
const pageUrl = 'https://www.printables.com/model/123-bracket'
const fileUrl = 'https://files.example.org/bracket.obj'
const result = (url, body, type = 'text/html', status = 200) => ({ url, body: Buffer.from(body), status, headers: { 'content-type': type } })
const file = result(fileUrl, obj, 'application/octet-stream')
async function package3mf(extra) {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>')
  zip.file('3D/3dmodel.model', '<model><resources><object><mesh><vertices><vertex x="0" y="0" z="0"/></vertices><triangles><triangle v1="0" v2="0" v3="0"/></triangles></mesh></object></resources></model>')
  if (extra) zip.file('Metadata/extra.txt', extra)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

describe('model content validation', () => {
  it('accepts actual OBJ, ASCII STL and binary STL geometry', () => {
    expect(validateModelResponse(file).format).toBe('obj')
    const ascii = 'solid triangle\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid triangle'
    expect(validateModelResponse(result('https://files.example.org/a.stl', ascii, 'model/stl')).format).toBe('stl')
    const binary = Buffer.alloc(134)
    binary.writeUInt32LE(1, 80)
    expect(validateModelResponse(result('https://files.example.org/a.stl', binary, 'model/stl')).format).toBe('stl')
  })
  it('rejects HTML disguised as a model and malformed or nonfinite geometry', () => {
    expect(() => validateModelResponse(result(fileUrl, '<html>Please log in</html>', 'application/octet-stream'))).toThrow(/web page/)
    for (const body of ['v NaN 0 0\nv 0 1 0\nv 0 0 1\nf 1 2 3', 'v 0 0 0\nv 0 1 0\nv 0 0 1\nf 1 2 4', 'not a model']) {
      expect(() => validateModelResponse(result(fileUrl, body, 'text/plain'))).toThrow(/complete 3D model/)
    }
  })
  it('uses sanitized response filenames and checks a real 3MF package', async () => {
    const response = result('https://files.example.org/download:12', await package3mf(), 'application/octet-stream')
    response.headers['content-disposition'] = 'attachment; filename="../../part.3mf"'
    expect(validateModelResponse(response)).toMatchObject({ name: 'part.3mf', format: '3mf' })
  })
  it('rejects generic ZIP, oversized ZIP entries, and decompression bombs', async () => {
    const generic = await new JSZip().file('hello.txt', 'hello').generateAsync({ type: 'nodebuffer' })
    expect(() => validateModelResponse(result('https://files.example.org/a.3mf', generic, 'application/octet-stream'))).toThrow()
    const bomb = await package3mf('A'.repeat(2 * 1024 * 1024))
    expect(() => validateModelResponse(result('https://files.example.org/a.3mf', bomb, 'application/octet-stream'))).toThrow()
    const forged = await package3mf()
    const central = forged.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
    forged.writeUInt32LE(64 * 1024 * 1024, central + 24)
    expect(() => validateModelResponse(result('https://files.example.org/a.3mf', forged, 'application/octet-stream'))).toThrow()
  })
})

describe('public model link discovery', () => {
  it('imports a direct file with source provenance', async () => {
    const fetchPublic = vi.fn().mockResolvedValue(file)
    const imported = await importPublicModel({ url: fileUrl }, { fetchPublic })
    expect(imported).toMatchObject({ status: 'imported', source: { url: fileUrl, provider: 'Direct file' }, file: { name: 'bracket.obj', format: 'obj' } })
    expect(imported.file.body.equals(obj)).toBe(true)
  })
  it('imports an observed public download and preserves the author and source', async () => {
    const fetchPublic = vi.fn().mockResolvedValueOnce(result(pageUrl, `<title>Wall bracket</title><meta name="author" content="Alex"><a href="${fileUrl}">Download</a>`)).mockResolvedValueOnce(file)
    const imported = await importPublicModel({ url: pageUrl }, { fetchPublic })
    expect(imported.source.attribution).toContain('Alex')
    expect(imported.source.url).toBe(pageUrl)
    expect(fetchPublic.mock.calls[1][0]).toBe(fileUrl)
  })
  it('returns multiple candidates without downloading or silently picking one', async () => {
    const fetchPublic = vi.fn().mockResolvedValue(result(pageUrl, `<a href="${fileUrl}">A</a><a href="https://files.example.org/b.stl">B</a>`))
    const choices = await importPublicModel({ url: pageUrl }, { fetchPublic })
    expect(choices.status).toBe('select_file')
    expect(choices.files).toHaveLength(2)
    expect(fetchPublic).toHaveBeenCalledTimes(1)
  })
  it('rediscovers the chosen file and refuses unobserved selection URLs', async () => {
    const page = result(pageUrl, `<a href="${fileUrl}">A</a><a href="https://files.example.org/b.stl">B</a>`)
    const fetchPublic = vi.fn().mockResolvedValueOnce(page).mockResolvedValueOnce(file)
    expect((await importPublicModel({ url: pageUrl, selectionUrl: fileUrl }, { fetchPublic })).status).toBe('imported')
    const forged = vi.fn().mockResolvedValue(page)
    await expect(importPublicModel({ url: pageUrl, selectionUrl: 'https://unrelated.example.org/c.obj' }, { fetchPublic: forged })).rejects.toMatchObject({ code: 'invalid_selection' })
    expect(forged).toHaveBeenCalledTimes(1)
  })
  it('finds public JSON file links and entity-encoded signed URLs without executing scripts', async () => {
    const signed = 'https://files.example.org/bracket.obj?a=1&b=2'
    const html = `<script type="application/ld+json">${JSON.stringify({ contentUrl: signed, author: { name: 'Morgan' } })}</script><script>throw new Error('never run')</script>`
    const fetchPublic = vi.fn().mockResolvedValueOnce(result(pageUrl, html)).mockResolvedValueOnce({ ...file, url: signed })
    const imported = await importPublicModel({ url: pageUrl }, { fetchPublic })
    expect(imported.source.attribution).toContain('Morgan')
    expect(fetchPublic.mock.calls[1][0]).toBe(signed)
  })
  it('follows one observed files tab for the same design', async () => {
    const fetchPublic = vi.fn().mockResolvedValueOnce(result(pageUrl, `<a href="${pageUrl}/files">Model files</a>`))
      .mockResolvedValueOnce(result(`${pageUrl}/files`, `<a href="${fileUrl}">A</a>`)).mockResolvedValueOnce(file)
    expect((await importPublicModel({ url: pageUrl }, { fetchPublic })).status).toBe('imported')
    expect(fetchPublic).toHaveBeenCalledTimes(3)
  })
  it.each([401, 402, 403, 429])('provides fallback for gated status %s', async status => {
    await expect(importPublicModel({ url: pageUrl }, { fetchPublic: async () => result(pageUrl, '', 'text/html', status) })).rejects.toMatchObject({ code: 'source_restricted' })
  })
  it('does not bypass verification pages or invent download endpoints', async () => {
    for (const [html, code] of [['<title>Just a moment...</title><script>cf-chl-token</script>', 'source_restricted'], ['<title>Model</title><button>Log in</button>', 'no_public_download']]) {
      const fetchPublic = vi.fn().mockResolvedValue(result(pageUrl, html))
      await expect(importPublicModel({ url: pageUrl }, { fetchPublic })).rejects.toMatchObject({ code })
      expect(fetchPublic).toHaveBeenCalledTimes(1)
    }
  })
  it('limits discovery to supported sources, ignores unsafe links, and caps choices', async () => {
    const fetchPublic = vi.fn()
    await expect(importPublicModel({ url: 'https://unrelated.example.org/private' }, { fetchPublic })).rejects.toMatchObject({ code: 'unsupported_source' })
    expect(fetchPublic).not.toHaveBeenCalled()
    const html = '<a href="https://127.0.0.1/a.stl">Bad</a>' + Array.from({ length: 30 }, (_, i) => `<a href="https://files.example.org/${i}.stl">File</a>`).join('')
    fetchPublic.mockResolvedValue(result(pageUrl, html))
    expect((await importPublicModel({ url: pageUrl }, { fetchPublic })).files).toHaveLength(12)
  })
})
