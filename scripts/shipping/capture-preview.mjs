import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fixtureCases, shippingFixture } from './fixtures.js';

const output = resolve(process.argv[2] || 'output/playwright/shipping');
mkdirSync(output, { recursive: true });
const base = 'http://127.0.0.1:3112';
const browser = await chromium.launch({ headless: true, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
const manifest = { generatedAt: new Date().toISOString(), base, component: 'app/cart/Cart.jsx (CartContent)',
    pricing: 'calculateCartItemBreakdown + applyShopShipping + weightTiers', source: 'PRODUCT_WEIGHTS.csv',
    fixtureNotes: 'Guest carts; no saved address or confirmed private costs. Product images use the existing Photo pending placeholder. No production services.', captures: [] };
try {
    for (const [scenario, config] of Object.entries(fixtureCases)) {
        for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
            const context = await browser.newContext({ viewport, deviceScaleFactor: 1, serviceWorkers: 'block' });
            const blockedOrigins = new Set();
            await context.route('**/*', route => {
                const url = new URL(route.request().url());
                if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
                    blockedOrigins.add(url.origin); return route.abort('blockedbyclient');
                }
                return route.continue();
            });
            await context.addCookies([{ name: 'shipping-fixture', value: scenario, url: base }]);
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            const response = await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
            if (response.status() !== 200) throw new Error(`Preview returned ${response.status()}`);
            const summary = page.getByTestId('cart-summary');
            const delivery = page.getByTestId('summary-delivery');
            await delivery.waitFor({ timeout: 45000 });
            const summaryText = await summary.innerText();
            const deliveryText = await delivery.innerText();
            const expected = `SGD ${(config.expectedShippingCents / 100).toFixed(2)}`;
            if (!deliveryText.includes(expected)) throw new Error(`${scenario}: ${deliveryText} lacks ${expected}`);
            if (!await page.getByText('This is your guest cart.', { exact: false }).isVisible()) throw new Error('Guest cart did not render');
            if (errors.length) throw new Error(errors.join('\n'));
            const prefix = `${scenario}-${viewport.width}x${viewport.height}`;
            await page.screenshot({ path: resolve(output, `${prefix}-full.png`), fullPage: true });
            await summary.scrollIntoViewIfNeeded();
            await page.screenshot({ path: resolve(output, `${prefix}-scrolled.png`) });
            await summary.screenshot({ path: resolve(output, `${prefix}-summary.png`) });
            const api = await context.request.get(`${base}/api/checkout/breakdown`);
            const { cartBreakdown } = await api.json();
            const { cart, products } = shippingFixture(scenario);
            manifest.captures.push({ scenario, viewport, expectedShippingCents: config.expectedShippingCents,
                items: cart.map((item, i) => ({ slug: products[i].slug, priceSGD: products[i].basePrice.presentmentAmount, quantity: item.quantity })),
                tier: cartBreakdown[0].standardShipping.tier, deliveryCents: Math.round(cartBreakdown.reduce((sum, line) => sum + line.deliveryFee, 0) * 100),
                summaryText, deliveryText, blockedOrigins: [...blockedOrigins], pageErrors: errors,
                files: [`${prefix}-full.png`, `${prefix}-scrolled.png`, `${prefix}-summary.png`] });
            writeFileSync(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
            console.log(`${prefix}: ${expected}, no page errors`);
            await context.close();
        }
    }
} finally { await browser.close(); }
