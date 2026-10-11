// Server-only decoder. A fresh worker gives malformed/slow HEIC input a hard
// deadline and releases its WASM memory when conversion finishes.
const { parentPort, workerData } = process.getBuiltinModule('worker_threads')
const libheif = require('libheif-js/wasm-bundle')
const images = []
async function run() {
  try {
    images.push(...new libheif.HeifDecoder().decode(new Uint8Array(workerData)))
    if (images.length !== 1) throw Error('Use a single HEIC photo, not a sequence or collection.')
    const image = images[0], width = image.get_width(), height = image.get_height()
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 12000 || height > 12000 || width * height > 24000000) throw Error('Use a photo no larger than 24 megapixels.')
    const pixels = await new Promise((resolve, reject) => image.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, result => result ? resolve(result.data) : reject(Error('HEIC image could not be decoded.'))))
    parentPort.postMessage({ width, height, pixels }, [pixels.buffer])
  } catch (error) {
    parentPort.postMessage({ error: ['Use a single HEIC photo, not a sequence or collection.', 'Use a photo no larger than 24 megapixels.'].includes(error.message) ? error.message : 'HEIC image could not be decoded. Try exporting it as JPEG.' })
  } finally { for (const image of images) image.free() }
}
run()
