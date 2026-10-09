// @vitest-environment node
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { buildPageMetadata } from '@/lib/seo/metadata'

it('uses the compressed share image and retains the historical PNG', () => {
    const metadata = buildPageMetadata({ title: 'Fix It Today', path: '/' })
    expect(metadata.openGraph.images).toEqual(['https://www.fixitoday.com/fitogimage.jpg'])
    expect(metadata.twitter.images).toEqual(['https://www.fixitoday.com/fitogimage.jpg'])
    const jpg = readFileSync(join(process.cwd(), 'public/fitogimage.jpg'))
    expect(jpg.subarray(0, 3).toString('hex')).toBe('ffd8ff')
    expect(jpg.length).toBeLessThan(300000)
    expect(existsSync(join(process.cwd(), 'public/fitogimage.png'))).toBe(true)
})

it('leaves no PNG share metadata behind in page routes or SEO helpers', () => {
    const scan = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = join(directory, entry.name)
        return entry.isDirectory() ? scan(path) : /\.[jm]sx?$/.test(path) ? [path] : []
    })
    for (const file of [...scan('app'), ...scan('lib/seo')]) {
        expect(readFileSync(file, 'utf8'), file).not.toContain('fitogimage.png')
    }
})
