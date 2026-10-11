// @vitest-environment node
import { expect, it } from 'vitest'
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import { normalizeRepairPhoto, decodeHeic } from '@/lib/printerRepair/photoDecode'
import { repairPhotoError } from '@/lib/printerRepair/validate'

it.each(['jpeg','png','webp'])('decodes, bounds and emits a real email-compatible JPEG from %s', async format => {
  const input = await sharp({ create: { width: 4200, height: 2800, channels: 3, background: '#ffcc00' } })[format]().toBuffer()
  const photo = await normalizeRepairPhoto(input, '../../example.' + format)
  const decoded = await sharp(photo.bytes).metadata()
  expect(decoded).toMatchObject({ format: 'jpeg', width: 2048, height: 1365 })
  expect(decoded.exif).toBeUndefined(); expect(photo.bytes.length).toBeLessThanOrEqual(512 * 1024)
  expect(photo.originalName).toBe('example.' + format)
})
it('applies portrait EXIF rotation and strips metadata from the attachment', async () => {
  const input = await sharp({ create: { width: 120, height: 80, channels: 3, background: 'red' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer()
  const output = await normalizeRepairPhoto(input, 'portrait.jpg'), meta = await sharp(output.bytes).metadata()
  expect(meta.width).toBe(80); expect(meta.height).toBe(120); expect(meta.exif).toBeUndefined()
})
it('converts a synthetic HEIC using the actual isolated WASM decoder', async () => {
  const input = await readFile('tests/fixtures/repair-photos/synthetic.heic')
  const output = await normalizeRepairPhoto(input, 'Phone.HEIC')
  expect(await sharp(output.bytes).metadata()).toMatchObject({ format: 'jpeg', width: 96, height: 64 })
}, 15000)
it('terminates a decoder at the bounded deadline', async () => {
  await expect(decodeHeic(await readFile('tests/fixtures/repair-photos/synthetic.heic'), { timeoutMs: 1 })).rejects.toThrow('timed out')
})
it.each(['photo.jpg','photo.png','photo.webp','photo.heic','photo.svg'])('rejects forged or corrupt %s', async name => {
  await expect(normalizeRepairPhoto(Buffer.from('<svg>not a photograph</svg>'), name)).rejects.toMatchObject({ status: 400 })
})
it('rejects mismatched file extension despite a valid image signature', async () => {
  const bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: 'red' } }).png().toBuffer()
  await expect(normalizeRepairPhoto(bytes, 'fake.jpg')).rejects.toMatchObject({ status: 400 })
})
it('rejects oversized bodies and high pixel count before producing an attachment', async () => {
  await expect(normalizeRepairPhoto(Buffer.alloc(3 * 1024 * 1024 + 1), 'big.jpg')).rejects.toMatchObject({ status: 413 })
  const bytes = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: 'red' } }).png().toBuffer()
  await expect(normalizeRepairPhoto(bytes, 'pixels.png')).rejects.toMatchObject({ status: 400 })
})
it('rejects animated image payloads rather than silently dropping frames', async () => {
  const input = await readFile('tests/fixtures/repair-photos/animated.webp')
  await expect(normalizeRepairPhoto(input,'animated.webp')).rejects.toMatchObject({status:400})
})
it('accepts phone HEIC and empty browser MIME types, but rejects misleading MIME', () => {
  expect(repairPhotoError({name:'IMG_1.HEIC',type:'image/heic',size:100})).toBe('')
  expect(repairPhotoError({name:'image.jpeg',type:'',size:100})).toBe('')
  expect(repairPhotoError({name:'image.jpeg',type:'text/html',size:100})).toContain('Choose')
})
