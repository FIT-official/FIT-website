// Capture HTML exported by creatorDashboardUi.test.jsx. No app server or service credentials.
import { chromium } from '@playwright/test';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
const directory = resolve(process.argv[2] || 'output/playwright/creator-dashboard');
const names = ['owner-dashboard', 'creator-orders', 'track', 'upload-validation', 'print-queue'];
const browser = await chromium.launch({ headless: true });
const captures = [];
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    await page.route(/^https?:/, route => route.abort());
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    for (const name of names) {
        await page.goto(pathToFileURL(join(directory, `${name}.html`)).href);
        await page.screenshot({ path: join(directory, `${name}.png`), fullPage: true });
        captures.push({ name, title: await page.locator('h1').innerText(),
            overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), errors: [...errors] });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(pathToFileURL(join(directory, 'creator-orders.html')).href);
    await page.screenshot({ path: join(directory, 'creator-orders-mobile.png'), fullPage: true });
    captures.push({ name: 'creator-orders-mobile', overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) });
    await writeFile(join(directory, 'manifest.json'), JSON.stringify({ at: new Date().toISOString(), source: 'Static React fixture render; no app server, authentication, database or network', captures }, null, 2));
    console.log(JSON.stringify({ captures: captures.length, overflow: captures.some(item => item.overflow), errors: errors.length }));
} finally { await browser.close(); }
