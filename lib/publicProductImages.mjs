import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Build the client-safe asset list from the deployed public directory. No
// filesystem checks or failing HTTP probes are needed when a card renders.
export function publicProductImages(directory = join(dirname(fileURLToPath(import.meta.url)), '../public/product-images'), prefix = '/product-images') {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = `${prefix}/${entry.name}`
        if (entry.isDirectory()) return publicProductImages(join(directory, entry.name), path)
        return entry.isFile() ? [path] : []
    }).sort()
}
