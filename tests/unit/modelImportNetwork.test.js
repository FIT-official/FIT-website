// @vitest-environment node
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { createSafeFetcher, isPublicAddress, normalizePublicUrl } from '@/lib/modelImport/safeFetch'

const publicDns = () => Promise.resolve([{ address: '93.184.215.14', family: 4 }])
function transport(responses, onRequest) {
  return vi.fn((url, options, callback) => {
    const req = new EventEmitter()
    req.destroy = vi.fn()
    req.end = () => queueMicrotask(() => {
      onRequest?.(url, options)
      const result = responses.shift()
      const response = Readable.from(result.chunks || [Buffer.from(result.body || 'model')])
      if (result.abortOnDestroy) {
        const destroy = response.destroy.bind(response)
        response.destroy = () => { response.emit('aborted'); return destroy() }
      }
      response.statusCode = result.status || 200
      response.headers = result.headers || {}
      callback(response)
    })
    return req
  })
}

describe('public model network boundary', () => {
  it.each(['127.0.0.1', '10.1.2.3', '100.64.1.2', '169.254.169.254', '172.16.0.1', '192.168.1.1', '198.18.0.1', '192.0.2.1', '224.1.1.1', '255.255.255.255', '::1', '::ffff:8.8.8.8', 'fc00::1', 'fe80::1', '64:ff9b::7f00:1', '2001:db8::1', '2002:7f00:1::', '3fff::1'])(
    'rejects private or reserved address %s', address => expect(isPublicAddress(address)).toBe(false))
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])(
    'permits global address %s', address => expect(isPublicAddress(address)).toBe(true))
  it.each(['http://example.com/a.stl', 'https://user:password@example.com/a.stl', 'https://example.com:8443/a.stl', 'https://127.1/a.stl', 'https://2130706433/a.stl', 'https://0x7f000001/a.stl', 'https://[::ffff:127.0.0.1]/a.stl', 'file:///etc/passwd', 'https://localhost./a.stl'])(
    'rejects unsafe URL %s', url => expect(() => normalizePublicUrl(url)).toThrow())
  it('rejects any mixed public/private DNS response before making a request', async () => {
    const request = vi.fn()
    const fetch = createSafeFetcher({ lookup: async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }], request })
    await expect(fetch('https://models.example.org/file.stl')).rejects.toMatchObject({ code: 'unsafe_url' })
    expect(request).not.toHaveBeenCalled()
  })
  it('pins all socket lookups to the validated DNS result and sends no credentials', async () => {
    const lookup = vi.fn(publicDns)
    const request = transport([{ body: 'safe' }], (_url, options) => {
      options.lookup('models.example.org', {}, (_error, address) => expect(address).toBe('93.184.215.14'))
      options.lookup('models.example.org', { all: true }, (_error, addresses) => expect(addresses).toEqual([{ address: '93.184.215.14', family: 4 }]))
      expect(options.agent).toBe(false)
      expect(options.headers.Authorization).toBeUndefined()
      expect(options.headers.Cookie).toBeUndefined()
      expect(options.headers['Accept-Encoding']).toBe('identity')
    })
    const response = await createSafeFetcher({ lookup, request })('https://models.example.org/file.stl')
    expect(response.body.toString()).toBe('safe')
    expect(lookup).toHaveBeenCalledTimes(1)
  })
  it('checks redirect DNS before connecting to the new target', async () => {
    const lookup = vi.fn().mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }]).mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }])
    const request = transport([{ status: 302, headers: { location: 'https://metadata.example.org/latest/meta-data' } }])
    await expect(createSafeFetcher({ lookup, request })('https://models.example.org/file.stl')).rejects.toMatchObject({ code: 'unsafe_url' })
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('blocks redirect literals and downgrade URLs before a request', async () => {
    for (const location of ['https://127.0.0.1/a.stl', 'http://models.example.org/a.stl', 'https://user:secret@models.example.org/a.stl']) {
      const request = transport([{ status: 302, headers: { location } }])
      await expect(createSafeFetcher({ lookup: publicDns, request })('https://models.example.org/file.stl')).rejects.toMatchObject({ code: 'unsafe_url' })
      expect(request).toHaveBeenCalledTimes(1)
    }
  })
  it('limits redirect chains', async () => {
    const request = transport(Array.from({ length: 4 }, () => ({ status: 302, headers: { location: '/next.stl' } })))
    await expect(createSafeFetcher({ lookup: publicDns, request })('https://models.example.org/file.stl')).rejects.toMatchObject({ code: 'too_many_redirects' })
    expect(request).toHaveBeenCalledTimes(4)
  })
  it('bounds bytes even when content length is missing or false', async () => {
    const request = transport([{ headers: { 'content-length': '1' }, chunks: [Buffer.alloc(5), Buffer.alloc(6)], abortOnDestroy: true }])
    await expect(createSafeFetcher({ lookup: publicDns, request })('https://models.example.org/file.stl', { maxBytes: 10 })).rejects.toMatchObject({ code: 'too_large' })
  })
  it('rejects oversized advertised downloads and unexpected compression', async () => {
    for (const [headers, code] of [[{ 'content-length': '999999999' }, 'too_large'], [{ 'content-encoding': 'gzip' }, 'unsupported_encoding']]) {
      const request = transport([{ headers }])
      await expect(createSafeFetcher({ lookup: publicDns, request })('https://models.example.org/file.stl')).rejects.toMatchObject({ code })
    }
  })
  it('bounds slow DNS and hanging responses', async () => {
    const dnsFetch = createSafeFetcher({ lookup: () => new Promise(() => {}), timeoutMs: 15 })
    await expect(dnsFetch('https://models.example.org/file.stl')).rejects.toMatchObject({ code: 'timeout' })
    const request = vi.fn(() => Object.assign(new EventEmitter(), { end() {}, destroy() {} }))
    await expect(createSafeFetcher({ lookup: publicDns, request, timeoutMs: 15 })('https://models.example.org/file.stl')).rejects.toMatchObject({ code: 'timeout' })
  })
})
