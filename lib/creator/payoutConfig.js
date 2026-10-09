// PLACEHOLDER — Chairman to set. These values are not a fee agreement.
export const FIT_PLATFORM_FEE_RATE = 0.10;
export const FIT_PLATFORM_FEE_BASIS_POINTS = Math.round(FIT_PLATFORM_FEE_RATE * 10000);
// PLACEHOLDER estimate formula, not a claim about Stripe's actual pricing.
export const STRIPE_FEE_BASIS_POINTS = 340;
export const STRIPE_FIXED_FEE_CENTS = 50;
export const payoutConfig = Object.freeze({
    platformBasisPoints: FIT_PLATFORM_FEE_BASIS_POINTS,
    stripeBasisPoints: STRIPE_FEE_BASIS_POINTS,
    stripeFixedCents: STRIPE_FIXED_FEE_CENTS,
    currency: 'SGD',
});
