// Local Next pages, actual shared storefront layout, no external browser requests.
import { chromium } from '@playwright/test';
import { resolve, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
const directory = resolve(process.argv[2] || 'output/playwright/creator-dashboard');
const origin = process.argv[3] || 'http://127.0.0.1:3107';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Local fixture server only');
await mkdir(directory, { recursive: true });
const views = [
    ['home-v2', '/?home=v2'], ['shop', '/shop'],
    ['owner-dashboard', '/admin/creator-dashboard'], ['creator-orders', '/dashboard/creator/orders'],
    ['track', '/track/1234567890abcdef1234567890abcdef'], ['upload-validation', '/dashboard/creator/uploads?validation=size'],
    ['print-queue', '/admin/creator-dashboard/queue'], ['creator-queue', '/dashboard/creator/jobs'],
    ['fleet', '/dashboard/creator/fleet'], ['owner-fleet', '/admin/creator-dashboard/fleet'],
    ['payouts', '/dashboard/creator/payouts'], ['owner-payouts', '/admin/creator-dashboard/payouts'],
];
const selected = process.argv[4] ? views.filter(([name]) => name === process.argv[4]) : views;
const browser = await chromium.launch({ headless: true });
const captures = [], blocked = new Set();
try {
    const context = await browser.newContext({ deviceScaleFactor: 1, reducedMotion: 'reduce' });
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
        blocked.add(url.origin); return route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        for (const [name, path] of selected) {
            errors.length = 0;
            const response = await page.goto(`${origin}${path}`, { waitUntil: 'networkidle', timeout: 120000 });
            if (response.status() !== 200) throw new Error(`${name}: HTTP ${response.status()}`);
            await page.locator('h1').first().waitFor();
            await page.evaluate(() => document.fonts.ready);
            // Let the below-fold Next images load before the full-page evidence.
            await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 800) { window.scrollTo(0, y); await new Promise(resolve => setTimeout(resolve, 35)); } window.scrollTo(0, 0); });
            const metrics = await page.evaluate(() => {
                const h1 = document.querySelector('h1'), frame = document.querySelector('[data-fit-page-frame]');
                const style = getComputedStyle(h1);
                return { title: h1.textContent, overflow: document.documentElement.scrollWidth > innerWidth,
                    frameWidth: Math.round(frame?.getBoundingClientRect().width || 0), header: !!document.querySelector('nav[aria-label="Primary"]'), footer: !!document.querySelector('footer'),
                    fontFamily: style.fontFamily, titleSize: style.fontSize, titleColor: style.color };
            });
            if (name === 'upload-validation') await page.getByRole('alert').filter({ hasText: 'File exceeds its size limit' }).waitFor();
            await page.screenshot({ path: join(directory, `${name}-${viewport.width}.png`), animations: 'disabled' });
            await page.screenshot({ path: join(directory, `${name}-${viewport.width}-full.png`), fullPage: true, animations: 'disabled' });
            if (await page.locator('.cd-content').count()) {
                await page.locator('.cd-content').evaluate(element => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 64));
                await page.screenshot({ path: join(directory, `${name}-${viewport.width}-content.png`), animations: 'disabled' });
            }
            captures.push({ name, path, viewport, status: response.status(), ...metrics, errors: [...errors] });
            console.log(`${name} ${viewport.width}: ${response.status()}, overflow=${metrics.overflow}, errors=${errors.length}`);
        }
        if (!process.argv[4]) for (const [name] of views.slice(2)) {
            await sharp({ create: { width: viewport.width * 3, height: viewport.height, channels: 3, background: '#ffffff' } })
                .composite(['home-v2', name, 'shop'].map((item, index) => ({ input: join(directory, `${item}-${viewport.width}.png`), left: index * viewport.width, top: 0 })))
                .png().toFile(join(directory, `${name}-${viewport.width}-comparison.png`));
        }
    }
    if (!process.argv[4]) {
        const sections = [1440, 390].map(width => `<h2>${width}px</h2>${views.slice(2).map(([name]) => `<section><h3>${name.replaceAll('-', ' ')}</h3><p>Home v2 · ${name.replaceAll('-', ' ')} · Shop</p><a href="${name}-${width}-comparison.png"><img src="${name}-${width}-comparison.png" alt="Home v2, ${name}, and shop at ${width}px"></a><p><a href="${name}-${width}-full.png">Full page</a></p></section>`).join('')}`).join('');
        await writeFile(join(directory, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Creator workspace</title><style>body{font:15px/1.6 system-ui;margin:32px;color:#111;background:#fafafa}section{margin:32px 0;padding:24px;background:white;border:1px solid #ddd;border-radius:18px}img{width:100%;height:auto}a{color:inherit}</style><h1>Creator workspace</h1><p>Local fixture captures. Every comparison uses the same viewport on the same Next development server. Public catalogue rows are stored samples with representative local artwork.</p>${sections}</html>`);
    }
} finally {
    await writeFile(join(directory, process.argv[4] ? `manifest-${process.argv[4]}.json` : 'manifest.json'), JSON.stringify({ at: new Date().toISOString(), origin, source: 'Next development server; mock-only environment', blockedOrigins: [...blocked], captures }, null, 2));
    await browser.close();
}
if (captures.some(item => item.overflow || item.errors.length || !item.header || !item.footer)) process.exitCode = 1;
