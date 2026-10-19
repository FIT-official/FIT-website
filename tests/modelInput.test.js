// Link and file checks for the public print entry. Pure functions: no network, no archive extraction, no execution.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { inspectModelLink, checkModelFile } from '../lib/customPrint/modelInput'
import { GUIDED_FILE_BYTES } from '../lib/customPrint/guidedBrief'

const file = (parts, name, size) => { const f = new File(parts, name); if (size !== undefined) Object.defineProperty(f, 'size', { value: size }); return f }
const asciiStl = 'solid cube\n facet normal 0 0 1\n  outer loop\n   vertex 0 0 0\n   vertex 1 0 0\n   vertex 0 1 0\n  endloop\n endfacet\nendsolid cube\n'
const binaryStl = triangles => { const bytes = new Uint8Array(84 + 50 * triangles); new DataView(bytes.buffer).setUint32(80, triangles, true); return bytes }

describe('inspectModelLink', () => {
  it('accepts a public https link, labels only the host, and never claims a title', () => {
    const ok = inspectModelLink('  https://www.makerworld.com/en/models/12345-name?from=search#x  ')
    expect(ok).toMatchObject({ state: 'ok', host: 'makerworld.com', site: 'MakerWorld' })
    expect(ok.href.startsWith('https://www.makerworld.com/')).toBe(true)
    expect(Object.keys(ok).sort()).toEqual(['host', 'href', 'site', 'state'])         // no title/image/price/availability field exists
    expect(inspectModelLink('https://example.org/models/1')).toMatchObject({ state: 'ok', host: 'example.org', site: null })
  })
  it('treats empty input as empty, not an error', () => { expect(inspectModelLink('')).toEqual({ state: 'empty' }); expect(inspectModelLink('   ')).toEqual({ state: 'empty' }); expect(inspectModelLink(undefined)).toEqual({ state: 'empty' }) })
  it.each([
    ['not a url', 'makerworld'], ['bare words', 'a holder for cables'], ['http', 'http://makerworld.com/x'],
    ['javascript', 'javascript:alert(1)'], ['data', 'data:text/html,<script>1</script>'], ['file', 'file:///C:/secrets.txt'], ['ftp', 'ftp://example.org/a.stl'], ['blob', 'blob:https://example.org/uuid'],
    ['credentials', 'https://user:pass@example.org/x'], ['username only', 'https://user@example.org/x'], ['custom port', 'https://example.org:8443/x'],
    ['localhost', 'https://localhost/x'], ['loopback ip', 'https://127.0.0.1/x'], ['private 10.x', 'https://10.0.0.5/x'], ['private 192.168', 'https://192.168.1.10/x'], ['link-local', 'https://169.254.169.254/latest/meta-data'],
    ['decimal ip', 'https://2130706433/x'], ['hex ip', 'https://0x7f000001/x'], ['ipv6 loopback', 'https://[::1]/x'], ['ipv6 mapped', 'https://[::ffff:127.0.0.1]/x'],
    ['dot local', 'https://printer.local/x'], ['dot internal', 'https://db.internal/x'], ['single label host', 'https://intranet/x'], ['too long', 'https://example.org/' + 'a'.repeat(2100)],
  ])('rejects %s', (_name, value) => { const result = inspectModelLink(value); expect(result.state).toBe('invalid'); expect(result.message.length).toBeGreaterThan(10) })
  it('never needs the network: it does not touch fetch', () => {
    const original = globalThis.fetch; let calls = 0; globalThis.fetch = () => { calls++; throw new Error('no network') }
    try { inspectModelLink('https://makerworld.com/en/models/1') } finally { globalThis.fetch = original }
    expect(calls).toBe(0)
  })
})

describe('checkModelFile', () => {
  it('accepts a valid ASCII STL, binary STL, OBJ and 3MF signature, with size labels and unit/staff notes', async () => {
    expect(await checkModelFile(file([asciiStl], 'cube.stl'))).toMatchObject({ ok: true, ext: 'stl', kind: 'stl-ascii' })
    expect(await checkModelFile(file([binaryStl(12)], 'part.STL'))).toMatchObject({ ok: true, kind: 'stl-binary' })
    expect(await checkModelFile(file(['# cube\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'], 'part.obj'))).toMatchObject({ ok: true, kind: 'obj' })
    const threeMf = await checkModelFile(file([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])], 'part.3mf'))
    expect(threeMf).toMatchObject({ ok: true, kind: '3mf' }); expect(threeMf.note).toMatch(/does not open it/)
  })
  it.each([['empty', file([], 'a.stl'), 'empty'], ['no name', null, 'none']])('rejects %s', async (_n, f, code) => expect((await checkModelFile(f))).toMatchObject({ ok: false, code }))
  it('rejects oversize before reading, using the shared 3 MB bound (and exactly at the bound passes the size check)', async () => {
    const big = await checkModelFile(file([asciiStl], 'big.stl', GUIDED_FILE_BYTES + 1))
    expect(big).toMatchObject({ ok: false, code: 'size' }); expect(big.message).toMatch(/3\.00 MB/)
    expect((await checkModelFile(file([asciiStl], 'edge.stl', GUIDED_FILE_BYTES))).code).not.toBe('size')
  })
  it.each([['.gcode', 'G28\nG1 X10'], ['.step', 'ISO-10303'], ['.stp', 'x'], ['.zip', 'PK'], ['.exe', 'MZ'], ['.png', 'x'], ['.stl.txt', 'solid'], ['', 'x']])('rejects the type %s without reading it', async (ext, body) => {
    const result = await checkModelFile(file([body], 'model' + ext)); expect(result.ok).toBe(false); expect(['type']).toContain(result.code)
  })
  it('says why G-code is refused', async () => { expect((await checkModelFile(file(['G28'], 'x.gcode'))).message).toMatch(/machine instructions/) })
  it.each([
    ['a ZIP renamed .stl', ['PK\x03\x04rest'], 'a.stl'], ['a ZIP renamed .obj', ['PK\x03\x04rest'], 'a.obj'], ['a Windows executable named .stl', ['MZ\x90\x00'], 'a.stl'], ['an ELF named .obj', ['\x7fELF'], 'a.obj'],
    ['a script named .stl', ['#!/bin/sh\nrm -rf /'], 'a.stl'], ['a PDF named .3mf', ['%PDF-1.7'], 'a.3mf'], ['plain text named .3mf', ['solid not zip'], 'a.3mf'], ['G-code text named .stl', ['G28\nG1 X0 Y0\nM104 S200\n'], 'a.stl'],
    ['G-code text named .obj', ['G28\nG1 X0 Y0\n'], 'a.obj'], ['a truncated binary STL', [binaryStl(10).slice(0, 200)], 'a.stl'], ['an OBJ with NUL bytes', ['v 1 2 3\0\0'], 'a.obj'],
  ])('rejects %s as a content mismatch', async (_name, parts, name) => { const r = await checkModelFile(file(parts, name)); expect(r).toMatchObject({ ok: false, code: 'mismatch' }) })
  it('reports an unreadable file instead of throwing', async () => {
    const broken = { name: 'a.stl', size: 10, slice: () => ({ arrayBuffer: () => Promise.reject(new Error('io')) }) }
    expect(await checkModelFile(broken)).toMatchObject({ ok: false, code: 'read' })
  })
  it('only ever reads the first 64 KB of the file', async () => {
    let requested = null
    const f = { name: 'a.stl', size: 5000000, slice: (a, b) => { requested = [a, b]; return { arrayBuffer: async () => new TextEncoder().encode(asciiStl).buffer } } }
    expect(await checkModelFile(f, { maxBytes: 9e6 })).toMatchObject({ ok: true }); expect(requested).toEqual([0, 65536])
  })
  it('contains no archive-extraction, eval or network code (3MF is signature-checked only)', () => {
    // Code only: comments and user-facing message strings are stripped first (a message may say 'Unzip it').
    const raw = fs.readFileSync(path.join(__dirname, '../lib/customPrint/modelInput.js'), 'utf8')
    const stripLineComments = text => text.split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n')
    const stripStrings = text => text.replace(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g, '""')
    const source = stripStrings(stripLineComments(raw))
    expect(source).not.toMatch(/jszip|unzip|inflate|DecompressionStream|eval\(|new Function|importScripts|fetch\(|XMLHttpRequest|new Worker\(/i)
  })
})
