import sharp from 'sharp'
// Resolve the built-in at runtime: Next 16.0.10's Turbopack file tracer
// otherwise mistakes worker_threads for a file to copy into the deployment.
const { Worker } = process.getBuiltinModule('worker_threads')
import { join } from 'node:path'
import { fail } from '@/lib/fabrication/serverHttp'
import { REPAIR_PHOTO_BYTES } from './validate'

export const safePhotoName = value => String(value || 'photo').split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._ ()-]/g, '_').slice(-160)
const limits = { limitInputPixels: 24000000, failOn: 'warning', animated: false }
export async function decodeHeic(input, { timeoutMs = 8000 } = {}) {
  const worker = new Worker(join(process.cwd(), 'lib/printerRepair/photoDecodeWorker.cjs'), {
    workerData: new Uint8Array(input), resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 32 },
    // Do not inherit a test runner's Node loaders or provider credentials.
    execArgv: [], env: {}, stdout: true, stderr: true,
  })
  worker.stdout.resume(); worker.stderr.resume()
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('HEIC conversion timed out. Try exporting the photo as JPEG.')), timeoutMs)
      const done = (fn, value) => { clearTimeout(timer); fn(value) }
      worker.once('message', result => result.error ? done(reject, Error(result.error)) : done(resolve, result))
      worker.once('error', () => done(reject, Error('HEIC image could not be decoded. Try exporting it as JPEG.')))
      worker.once('exit', () => done(reject, Error('HEIC image could not be decoded. Try exporting it as JPEG.')))
    })
  } finally { await worker.terminate() }
}
export async function normalizeRepairPhoto(input, name, decode = decodeHeic) {
  if (!Buffer.isBuffer(input) || !input.length || input.length > REPAIR_PHOTO_BYTES) fail('Each photo must be between 1 byte and 3 MB.', 413)
  const originalName = safePhotoName(name), extension = originalName.toLowerCase().split('.').pop()
  const png = input.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  const jpeg = input[0] === 255 && input[1] === 216 && input[2] === 255
  const webp = input.subarray(0, 4).toString() === 'RIFF' && input.subarray(8,12).toString() === 'WEBP'
  const heic = input.subarray(4,8).toString() === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(input.subarray(8,12).toString())
  if (!({ png, jpg: jpeg, jpeg, webp, heic, heif: heic })[extension]) fail('Choose a complete JPEG, PNG, WebP or HEIC photo that matches its filename.')
  try {
    let instance
    if (heic) {
      const decoded = await decode(input)
      if (!Number.isSafeInteger(decoded.width) || !Number.isSafeInteger(decoded.height) || decoded.width < 1 || decoded.height < 1 || decoded.width * decoded.height > 24000000 || decoded.pixels?.length !== decoded.width * decoded.height * 4) fail('HEIC image could not be decoded safely.')
      instance = sharp(Buffer.from(decoded.pixels), { raw: { width: decoded.width, height: decoded.height, channels: 4 } })
    } else {
      instance = sharp(input, limits)
      const meta = await instance.metadata()
      if (!['jpeg','png','webp'].includes(meta.format) || !meta.width || !meta.height || meta.width > 12000 || meta.height > 12000 || meta.width * meta.height > 24000000 || (meta.pages || 1) !== 1) fail('Use a single photo no larger than 24 megapixels.')
    }
    // Rotate from EXIF, flatten transparency and strip location/EXIF metadata.
    // JPEG attachments open in ordinary desktop and phone email clients.
    for (const quality of [82, 65, 50]) {
      const output = await instance.clone().rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality }).toBuffer({ resolveWithObject: true })
      if (output.data.length <= 512 * 1024) return { bytes: output.data, width: output.info.width, height: output.info.height, contentType: 'image/jpeg', originalName }
    }
    fail('This photo is too detailed to attach. Crop or reduce it and try again.', 413)
  } catch (error) {
    if (error?.status) throw error
    fail(heic ? 'This HEIC photo could not be converted safely. Export it as JPEG and try again.' : 'This photo could not be decoded safely. Use a complete JPEG, PNG or WebP image up to 24 megapixels.')
  }
}
