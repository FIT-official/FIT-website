import { payoutConfig } from './payoutConfig';

function integer(value, label, max = Number.MAX_SAFE_INTEGER) {
    if (!Number.isSafeInteger(value) || value < 0 || value > max) throw new RangeError(`Invalid ${label}`);
    return value;
}
function safeNumber(value) {
    const number = Number(value); integer(number, 'amount'); return number;
}
// Round half up once per sub-order, with integer arithmetic throughout.
export function feeCents(grossCents, basisPoints) {
    integer(grossCents, 'gross cents'); integer(basisPoints, 'fee rate', 10000);
    return safeNumber((BigInt(grossCents) * BigInt(basisPoints) + 5000n) / 10000n);
}
export function calculatePayout(grossCents, config = payoutConfig) {
    integer(grossCents, 'gross cents'); integer(config.stripeFixedCents, 'fixed fee');
    const platformFeeCents = feeCents(grossCents, config.platformBasisPoints);
    const stripeFeeCents = grossCents === 0 ? 0 : safeNumber(BigInt(feeCents(grossCents, config.stripeBasisPoints)) + BigInt(config.stripeFixedCents));
    // A small order may have negative net; do not conceal that cost by clamping.
    const creatorNetCents = grossCents - platformFeeCents - stripeFeeCents;
    if (!Number.isSafeInteger(creatorNetCents)) throw new RangeError('Invalid creator net');
    return { grossCents, stripeFeeCents, platformFeeCents, creatorNetCents };
}
// Compatibility for old SubOrder prices stored in dollars: decimal parsing,
// not floating-point multiplication. New webhook items store unitAmountCents.
export function legacyPriceCents(price) {
    if (typeof price !== 'number' && typeof price !== 'string') throw new RangeError('Invalid price');
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(price));
    if (!match) throw new RangeError('Invalid price precision');
    return safeNumber(BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0')));
}
export function subOrderPayout(sub, config = payoutConfig) {
    const gross = sub.items.reduce((sum, item) => {
        integer(item.qty, 'quantity');
        const unit = item.unitAmountCents === undefined ? legacyPriceCents(item.price) : integer(item.unitAmountCents, 'unit cents');
        return sum + BigInt(unit) * BigInt(item.qty);
    }, 0n);
    return { subOrderId: String(sub._id), storeId: sub.storeId, status: sub.status,
        itemNames: sub.items.map(item => item.name).join(', '),
        // Refund fee treatment is not settled. Show zero gross/net estimate and
        // label it excluded; do not imply Stripe returned its processing fee.
        excluded: ['cancelled', 'refunded'].includes(sub.status),
        ...calculatePayout(['cancelled', 'refunded'].includes(sub.status) ? 0 : safeNumber(gross), config) };
}
export function summarizePayouts(subOrders, config = payoutConfig) {
    const rows = subOrders.map(sub => subOrderPayout(sub, config));
    const totals = { grossCents: 0, stripeFeeCents: 0, platformFeeCents: 0, creatorNetCents: 0 };
    for (const row of rows) for (const key of Object.keys(totals)) {
        totals[key] += row[key];
        if (!Number.isSafeInteger(totals[key])) throw new RangeError('Invalid payout total');
    }
    return { rows, totals, currency: config.currency, estimate: true };
}
