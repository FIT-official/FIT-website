# Creator stores
The storefront uses three software subscriptions in SGD per month: Free S$0, Standard S$39, Pro S$99. One account operates one storefront. Product limits are 3/25/100 and inbound print-request limits are 10/100/500 per UTC calendar month. All stored product records count, including hidden listings. Removing a product releases its slot. Existing jobs/products are preserved on downgrade; additions stop at the lower cap.

Creator print jobs use customer-agreed quotations and direct customer-to-creator payments. They do not provide automatic Stripe Connect payouts. FIT catalogue checkout is a separate flow. Materials, machine time, delivery, repairs and customer acquisition are not included.

## Configuration
1. Configure Clerk, MongoDB, S3 and the existing mail/chat integrations in a non-production deployment. MongoDB must support transactions for checkout fulfilment.
2. Preview the new Stripe catalogue with `node scripts/configure-creator-plans.mjs`. With a test key, run it with `--apply`. It creates/reuses two SGD monthly prices and prints only their IDs. Set STRIPE_STANDARD_MONTHLY_PRICE_ID and STRIPE_PRO_MONTHLY_PRICE_ID to those IDs. Live mode also requires `--live`. Existing subscriptions and old prices are not migrated or cancelled.
3. Keep NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY and STRIPE_SECRET_KEY in the same Stripe mode/account. New price records use inclusive tax behavior; verify the business's GST obligations/configuration separately. Do not add undisclosed tax above the displayed amount.
4. Configure the signed subscription webhook at /api/user/subscription/webhook for customer.subscription.created, customer.subscription.updated and customer.subscription.deleted, using STRIPE_SUBSCRIPTION_SIGNING_SECRET (legacy deletion secret remains supported). The separate existing checkout webhook uses STRIPE_SESSION_COMPLETE_SIGNING_SECRET.
5. Verify Clerk webhook delivery at /api/newUser. Registration always starts free and never creates a charge or a connected seller account from user-supplied metadata.
6. Run regression tests and a production build with actual deployment configuration. Test registration/email verification, Google callback, onboarding, Free shop setup, request delivery, limits, authenticated file upload, paid activation, 3DS, declined payments, renewal, downgrade and cancellation using provider test modes.
7. Test two distinct creator accounts to confirm that each sees only its own jobs and private files. Validate signed upload constraints and S3 CORS with a real test bucket.
8. Before publishing, reconcile any old open checkout sessions without item snapshots. They fail closed in the new fulfilment path and need operator reconciliation. Test duplicate webhooks and database transaction support.
9. Perform an operator-reviewed catalogue pass: actual stock, duplicate products, shipping charges, lead times, refund policy and fulfilment contact details need business evidence.

## Existing paid accounts
Existing subscriptions remain billable at their current Stripe prices. Unmapped legacy plans retain Free baseline access and their stored records; their subscription status is visible. Map/offer a deliberate transition only after identifying the subscribers and their promised benefits. Do not silently change existing customers' prices.

## Verification limits
Local tests mock Clerk/Stripe/Mongo/S3 unless stated otherwise. They cannot establish real email delivery, payment settlement, seller payouts, provider permissions, MongoDB transactions or production availability. Catalogue setup and publication are separate verified deployment steps.
