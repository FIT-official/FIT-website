// @vitest-environment node
import { expect, it } from 'vitest';
import Stripe from 'stripe';
const stripe = new Stripe('sk_test_OFFLINE_ONLY');
const secret = 'whsec_OFFLINE_TEST_ONLY';
const payload = JSON.stringify({ id: 'evt_offline', type: 'checkout.session.completed', data: { object: {} } });
it('verifies raw payload signatures locally without contacting Stripe', () => {
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(stripe.webhooks.constructEvent(payload, signature, secret).id).toBe('evt_offline');
    expect(() => stripe.webhooks.constructEvent(payload + ' ', signature, secret)).toThrow();
    expect(() => stripe.webhooks.constructEvent(payload, signature, 'whsec_WRONG')).toThrow();
    expect(() => stripe.webhooks.constructEvent(payload, null, secret)).toThrow();
});
it('rejects stale signed events outside the SDK tolerance', () => {
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: Math.floor(Date.now()/1000)-600 });
    expect(() => stripe.webhooks.constructEvent(payload, signature, secret)).toThrow(/Timestamp outside/);
});
