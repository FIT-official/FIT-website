import { inflateRawSync } from 'node:zlib'
import { importError } from './errors.js'
import { MAX_MODEL_BYTES } from './safeFetch.js'

export function modelFormat(value = '') {
  const match = /\.(stl|obj|3mf)$/i.exec(value.split(/[?#]/)[0])
  return match?.[1].toLowerCase() || null
}

export function safeFilename(value, format) {
  const name = String(value || `model.${format}`).split(/[\\/]/).pop()
    .replace(/[^a-zA-Z0-9._ ()-]/g, '_').slice(-120)
  return modelFormat(name) === format ? name : `model.${format}`
}

export function responseFilename(response, proposedName) {
  const disposition = response.headers['content-disposition'] || ''
  const encoded = /filename\*=UTF-8''([^;\r\n]+)/i.exec(disposition)?.[1]
  const plain = /filename\s*=\s*(?:"([^"\r\n]+)"|([^;\r\n]+))/i.exec(disposition)
  let name
  try { name = encoded ? decodeURIComponent(encoded) : plain?.[1] || plain?.[2] } catch { /* use URL */ }
  if (name && modelFormat(name.trim())) return name.trim()
  if (proposedName && modelFormat(proposedName)) return proposedName
  try { return decodeURIComponent(new URL(response.url).pathname.split('/').pop()) } catch { return '' }
}

export function looksLikeHtml(body, contentType = '') {
  return /text\/html|application\/xhtml/i.test(contentType) ||
    /^\s*(?:<!doctype\s+html|<html|<head|<body|<script|<!--)/i.test(body.subarray(0, 2048).toString('utf8'))
}

const invalid = () => { throw importError('invalid_model', 'The downloaded file is not a supported, complete 3D model.') }

function validateStl(body) {
  if (body.length >= 84) {
    const count = body.readUInt32LE(80)
    if (count > 0 && 84 + count * 50 === body.length) {
      for (let face = 0; face < count; face++) {
        for (let value = 0; value < 12; value++) {
          if (!Number.isFinite(body.readFloatLE(84 + face * 50 + value * 4))) invalid()
        }
      }
      return
    }
  }
  const text = body.toString('utf8')
  if (text.includes('\0') || !/^\s*solid\b/i.test(text) || !/\bendsolid\b/i.test(text)) invalid()
  const vertices = [...text.matchAll(/\bvertex\s+(\S+)\s+(\S+)\s+(\S+)/gi)]
  const facets = text.match(/\bfacet\s+normal\b/gi) || []
  if (!facets.length || vertices.length !== facets.length * 3 ||
      vertices.some(match => match.slice(1).some(value => !Number.isFinite(Number(value))))) invalid()
}

function validateObj(body) {
  const text = body.toString('utf8')
  if (text.includes('\0')) invalid()
  let vertices = 0
  let faces = 0
  const referenced = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (/^v\s/.test(line)) {
      const values = line.split(/\s+/).slice(1, 4)
      if (values.length !== 3 || values.some(value => !Number.isFinite(Number(value)))) invalid()
      vertices++
    } else if (/^f\s/.test(line)) {
      const parts = line.split(/\s+/).slice(1)
      if (parts.length < 3 || parts.some(value => !/^-?[1-9]\d*(?:\/-?\d*)?(?:\/-?\d+)?$/.test(value))) invalid()
      for (const value of parts) {
        const index = Number(value.split('/')[0])
        if (!Number.isSafeInteger(index) || index === 0 || (index < 0 && -index > vertices)) invalid()
        if (index > 0) referenced.push(index)
      }
      faces++
    }
  }
  if (vertices < 3 || !faces || referenced.some(index => index > vertices)) invalid()
}

// Check the ZIP directory before inflating. Never trust compressed size or a .3mf suffix alone.
export function validate3mfBytes(value) {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(value)
  let end = -1
  for (let offset = body.length - 22; offset >= Math.max(0, body.length - 65557); offset--) {
    if (body.readUInt32LE(offset) === 0x06054b50 && offset + 22 + body.readUInt16LE(offset + 20) === body.length) { end = offset; break }
  }
  if (end < 0 || body.readUInt16LE(end + 4) !== 0 || body.readUInt16LE(end + 6) !== 0) invalid()
  const count = body.readUInt16LE(end + 10)
  const centralSize = body.readUInt32LE(end + 12)
  const centralOffset = body.readUInt32LE(end + 16)
  if (!count || count > 256 || body.readUInt16LE(end + 8) !== count || centralOffset + centralSize !== end) invalid()
  let offset = centralOffset
  let total = 0
  let hasManifest = false
  let hasMesh = false
  const names = new Set()
  for (let entry = 0; entry < count; entry++) {
    if (offset + 46 > end || body.readUInt32LE(offset) !== 0x02014b50) invalid()
    const flags = body.readUInt16LE(offset + 8)
    const method = body.readUInt16LE(offset + 10)
    const compressed = body.readUInt32LE(offset + 20)
    const uncompressed = body.readUInt32LE(offset + 24)
    const nameLength = body.readUInt16LE(offset + 28)
    const extraLength = body.readUInt16LE(offset + 30)
    const commentLength = body.readUInt16LE(offset + 32)
    const start = body.readUInt32LE(offset + 42)
    const next = offset + 46 + nameLength + extraLength + commentLength
    if (next > end || start + 30 > centralOffset) invalid()
    const name = body.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    total += uncompressed
    if (flags & 1 || ![0, 8].includes(method) || uncompressed > 16 * 1024 * 1024 || total > 32 * 1024 * 1024 ||
        uncompressed > Math.max(1024 * 1024, compressed * 200) || !name || /[\\\0]/.test(name) ||
        name.startsWith('/') || name.split('/').includes('..') || names.has(name)) invalid()
    names.add(name)
    if (body.readUInt32LE(start) !== 0x04034b50 || body.readUInt16LE(start + 6) !== flags || body.readUInt16LE(start + 8) !== method) invalid()
    const localNameLength = body.readUInt16LE(start + 26)
    const payload = start + 30 + localNameLength + body.readUInt16LE(start + 28)
    if (payload + compressed > centralOffset || body.subarray(start + 30, start + 30 + localNameLength).toString('utf8') !== name) invalid()
    let data
    try {
      const input = body.subarray(payload, payload + compressed)
      data = method === 8 ? inflateRawSync(input, { maxOutputLength: Math.max(1, uncompressed + 1) }) : input
    } catch { invalid() }
    if (data.length !== uncompressed) invalid()
    if (name === '[Content_Types].xml') hasManifest = /3dmanufacturing-3dmodel\+xml/i.test(data.toString('utf8'))
    if (/^3D\/.*\.model$/i.test(name)) {
      const xml = data.toString('utf8')
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) invalid()
      if (/<(?:\w+:)?model\b/i.test(xml) && /<(?:\w+:)?mesh\b/i.test(xml) &&
          /<(?:\w+:)?vertex\b/i.test(xml) && /<(?:\w+:)?triangle\b/i.test(xml)) hasMesh = true
    }
    offset = next
  }
  if (offset !== end || !hasManifest || !hasMesh) invalid()
}

export function validateModelResponse(response, proposedName) {
  const body = response.body
  if (!body?.length) invalid()
  if (body.length > MAX_MODEL_BYTES) throw importError('too_large', 'This file exceeds the 4 MB link import limit.')
  if (looksLikeHtml(body, response.headers['content-type'])) {
    throw importError('html_instead_of_model', 'The source returned a web page instead of a model file. It may require a login or manual download.')
  }
  const filename = responseFilename(response, proposedName)
  const format = modelFormat(filename)
  if (!format) throw importError('unsupported_format', 'Only STL, OBJ and 3MF files can be imported.')
  if (format === 'stl') validateStl(body)
  if (format === 'obj') validateObj(body)
  if (format === '3mf') validate3mfBytes(body)
  return { body, name: safeFilename(filename, format), format,
    contentType: { stl: 'model/stl', obj: 'text/plain', '3mf': 'model/3mf' }[format] }
}
