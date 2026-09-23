import { lookup as dnsLookup } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'
import { BlockList, isIP } from 'node:net'
import { importError } from './errors.js'

export const MAX_MODEL_BYTES = 4 * 1024 * 1024
export const MAX_PAGE_BYTES = 2 * 1024 * 1024
const blocked = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.31.196.0', 24], ['192.52.193.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['192.175.48.0', 24], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked.addSubnet(address, prefix, 'ipv4')
for (const [address, prefix] of [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3ffe::', 16], ['3fff::', 20],
]) blocked.addSubnet(address, prefix, 'ipv6')
const globalV6 = new BlockList()
globalV6.addSubnet('2000::', 3, 'ipv6')

export function isPublicAddress(address) {
  const family = isIP(address)
  if (family === 4) return !blocked.check(address, 'ipv4')
  // Restrict IPv6 to global unicast; mapped IPv4, NAT64, ULA and link-local are excluded.
  return family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6')
}

export function normalizePublicUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) {
    throw importError('invalid_url', 'Enter a public HTTPS model link.', 400)
  }
  let url
  try { url = new URL(value.trim()) } catch { throw importError('invalid_url', 'Enter a valid HTTPS model link.', 400) }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw importError('unsafe_url', 'Only public HTTPS links without login details or custom ports can be imported.', 400)
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
  if (!host || host.includes('%') || (isIP(host) ? !isPublicAddress(host) : (
    !host.includes('.') || /(^|\.)(localhost|local|internal|lan|home|test|invalid|onion)$/.test(host)
  ))) throw importError('unsafe_url', 'That address is not a public model download.', 400)
  url.hash = ''
  if (encodeURIComponent(url.href).length > 4096) throw importError('invalid_url', 'The model link is too long to import.', 400)
  return url
}

function timeoutPromise(promise, timeout) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(importError('timeout', 'The source took too long to respond.')), timeout) }),
  ]).finally(() => clearTimeout(timer))
}

/** One import gets one budget, shared by discovery, redirects and the selected file. */
export function createSafeFetcher({ lookup = dnsLookup, request = httpsRequest, timeoutMs = 20000 } = {}) {
  const deadline = Date.now() + timeoutMs
  let requests = 0
  let totalBytes = 0
  const remaining = () => {
    const ms = deadline - Date.now()
    if (ms <= 0) throw importError('timeout', 'The source took too long to respond.')
    return ms
  }

  return async function fetchPublic(value, { maxBytes = MAX_MODEL_BYTES } = {}) {
    let url = normalizePublicUrl(String(value))
    for (let redirects = 0; ; redirects++) {
      if (++requests > 6) throw importError('too_many_requests', 'This source requires too many download steps.')
      const host = url.hostname.replace(/^\[|\]$/g, '')
      let addresses
      try {
        addresses = isIP(host) ? [{ address: host, family: isIP(host) }] :
          await timeoutPromise(lookup(host, { all: true, verbatim: true }), Math.min(3000, remaining()))
      } catch (error) {
        if (error.code === 'timeout') throw error
        throw importError('source_unavailable', 'The source address could not be reached.')
      }
      if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
        throw importError('unsafe_url', 'The source points to an address that cannot be imported.', 400)
      }
      // The socket receives only these checked addresses. There is no second DNS lookup.
      const pinnedLookup = (_hostname, options, callback) => {
        if (typeof options === 'function') { callback = options; options = {} }
        if (options?.all) callback(null, addresses)
        else callback(null, addresses[0].address, addresses[0].family)
      }
      const result = await new Promise((resolve, reject) => {
        let finished = false
        let timer
        let req
        const finish = (error, result) => {
          if (finished) return
          finished = true
          clearTimeout(timer)
          if (error) { req?.destroy(); reject(error) } else resolve(result)
        }
        try {
          req = request(url, {
            method: 'GET', agent: false, lookup: pinnedLookup,
            headers: {
              'User-Agent': 'FixItTodayModelImporter/1.0',
              Accept: 'text/html,model/stl,model/3mf,application/octet-stream;q=0.9,*/*;q=0.5',
              'Accept-Encoding': 'identity',
            },
          }, (res) => {
            const status = res.statusCode || 0
            const headers = res.headers
            if ([301, 302, 303, 307, 308].includes(status)) {
              res.destroy()
              finish(null, { status, headers })
              return
            }
            if (status !== 200) {
              res.destroy()
              finish(null, { status, headers, body: Buffer.alloc(0), url: url.href })
              return
            }
            if (headers['content-encoding'] && headers['content-encoding'] !== 'identity') {
              res.destroy()
              finish(importError('unsupported_encoding', 'The source did not provide a downloadable uncompressed response.'))
              return
            }
            const isPage = /text\/html|application\/xhtml/i.test(headers['content-type'] || '')
            const ceiling = isPage ?
              Math.min(maxBytes, MAX_PAGE_BYTES) : maxBytes
            const tooLarge = () => isPage ?
              importError('page_too_large', 'The source page is too large to scan for a public download.') :
              importError('too_large', 'This file is too large to import by link (maximum 4 MB).')
            const declared = Number(headers['content-length'])
            if (Number.isFinite(declared) && declared > ceiling) {
              res.destroy()
              finish(tooLarge())
              return
            }
            const chunks = []
            let size = 0
            res.on('data', (chunk) => {
              size += chunk.length
              totalBytes += chunk.length
              if (size > ceiling || totalBytes > 8 * 1024 * 1024) {
                finish(tooLarge())
                res.destroy()
              } else chunks.push(chunk)
            })
            res.on('end', () => finish(null, { status, headers, body: Buffer.concat(chunks), url: url.href }))
            res.on('error', () => finish(importError('source_unavailable', 'The download was interrupted.')))
            res.on('aborted', () => finish(importError('source_unavailable', 'The download was interrupted.')))
          })
          req.on('error', () => finish(importError('source_unavailable', 'The source could not be downloaded.')))
          timer = setTimeout(() => finish(importError('timeout', 'The source took too long to respond.')), remaining())
          req.end()
        } catch (error) {
          finish(error.code ? error : importError('source_unavailable', 'The source could not be downloaded.'))
        }
      })
      if (![301, 302, 303, 307, 308].includes(result.status)) return result
      if (redirects >= 3 || !result.headers.location) {
        throw importError('too_many_redirects', 'The source redirected too many times.')
      }
      let next
      try { next = new URL(result.headers.location, url).href } catch { throw importError('invalid_redirect', 'The source returned an invalid download link.') }
      url = normalizePublicUrl(next)
    }
  }
}
