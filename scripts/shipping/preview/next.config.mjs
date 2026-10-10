import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shippingFixturesEnabled } from '../fixtureGuard.mjs';

if (!shippingFixturesEnabled()) throw new Error('Shipping fixtures require development mode and SHIPPING_FIXTURES=1');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const nextConfig = {
    devIndicators: false,
    experimental: { cpus: 1 },
    webpack(config) {
        config.resolve.alias['@'] = root;
        return config;
    },
};
export default nextConfig;
