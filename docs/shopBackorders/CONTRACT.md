# Shop quantity and conditional backorders

Isolated candidate from production `5789481df0ecfe506a30aed7b13bcb56cbda115e`, branch `feat/public-inventory-quantity-20261014`. This is a standard FIT shop change. Bulk Sheet inventory, manual PayNow/native invoicing, Friday Workshop, private classroom candidates, auth/middleware/navigation and credentials are unchanged. No production data, payments, messages, feature flags or deployment were changed.

## Customer behavior

Product cards and product detail accept 1–100 whole units with the selected variants. The cart supports an exact quantity edit and retains its existing increment/decrement controls. Exact edits compare the previous quantity and owner, rejecting stale tabs. Existing custom-print/digital fixed-quantity behavior remains.

With `FIT_SHOP_BACKORDERS_ENABLED=true`, checkout calculates availability from existing Mongo `Product.stock`, selected option stock and active allocations. Product and option pools are shared across repeated cart lines and concurrent buyers. Missing/invalid/infinite stock is not converted into a real number: those selections require owner confirmation before this automatic allocation path can proceed. No stock, price, tax, supplier date or shipping rate is invented.

The exact customer wording is:

> Restocking the remaining items may take 3–6 weeks. If an item won’t be restocked, we’ll inform you.

The buyer sees available/on-hand/backordered quantities before payment and acknowledges the notice when any units are backordered. A changed stock quote requires another review and acknowledgement. This range is conditional restocking guidance, not a delivery guarantee. Backordered orders do not acquire an automatic Google-review delivery estimate.

The current server price still applies to every ordered unit. Existing discounts, card and Stripe PayNow methods, and the single combined shipping calculation are preserved. Backorders do not create a second payment or another shipping fee. No partial-shipment charging policy is introduced.

`restockStatus` can be `unknown`, `expected` or `not_restocked` on a product or option. Existing editor/API/model paths preserve it; it does not modify physical counts. A non-restockable selected option overrides the product setting. Known non-restockable excess is blocked; available units can still be ordered. Existing records without this field remain unknown.

## Durable allocation and payment

Before calling Stripe, a Mongo transaction re-reads the actual cart, stock and held units, verifies the quote/acknowledgement, fences the buyer/product documents and inserts both the checkout attempt and allocation. Physical stock is unchanged by a hold. The built-in unique attempt `_id` keeps retries on the same purchase contract. Contract normalization and canonical hashes survive BSON serialization.

The existing Stripe idempotency key and saved CheckoutSession snapshot remain authoritative. On verified payment, allocation consumption, physical stock deduction, Order, customer history and cart cleanup share the existing transaction. Only `onHandQuantity` is deducted; the full bought quantity remains on the order/sales record. Duplicate webhooks cannot deduct again. Failure rolls back the transaction. Existing allocated attempts remain recoverable when new allocations are disabled.

Holds are **not released by time alone**. The existing checkout recovery/cancel path releases only after the exact Stripe session is confirmed expired and unpaid. A complete-but-unpaid asynchronous payment, missing provider response, unknown outcome or consumed hold stays protected. Attempts with an uncertain provider creation beyond the existing 23-hour retry window need reconciliation; no new payment is automatically created. Older unallocated payments cannot take another buyer’s reserved stock and instead require reconciliation.

New private collections: `shopbackorderallocations` and `shopbackorderaudit`. Optional `backorderRevision` counters fence product/user writes. Existing orders are neither migrated nor rewritten.

## Owner fulfillment

Open `/admin/shop-backorders` using the existing FIT admin account. Its API verifies the existing authoritative Clerk admin role; no new role or grant is introduced. Reads are private/no-store and paginated. It shows the immutable original split, remaining quantity, latest per-line fulfillment status and current restock policy. If an outstanding item is now not restockable, it flags the need to contact the customer. It does not send that message or issue a refund.

Record physically received units through the existing product inventory editor first. Then allocate those units to a paid order on the backorder page. The transaction checks actual available stock less other active holds, remaining backorder and expected fulfillment revision. It deducts stock once, updates Order and customer history and appends a private audit record. The original agreed allocation/notice remains unchanged. Staff identity is retained in the private audit, not added to the customer fulfillment object.

Cancelled/refunded/partially refunded orders or legacy per-line history require resolution instead of allocation. A hidden product can still fulfill an existing paid order. The existing order-status API blocks marking a whole line shipped/delivered while backordered units remain unallocated. Partial dispatch, refunds, cancellation/restock accounting and automatic customer notification are not implemented by this patch.

## Verification and reproduction

Use Node 22 and repository Yarn 1.22.22 dependencies. No dependency or lockfile change is included. The isolated checkout used its own copied dependency directory; a fresh frozen-lockfile install remains a release-environment check.

The handoff evidence includes stripped-environment runners `run-validation.cjs`, `run-mongo.cjs`, `run-browser.cjs` and `network-guard.cjs`. They sit beside `repo/`. Supply fresh receipt-directory names. They never load real `.env` files or provider credentials. The Mongo runner uses the existing portable Mongo 8.0.32 executable, an ephemeral loopback replica set and only synthetic records. The browser runner uses owned headless Chromium, loopback HTTP and actual React components with synthetic Clerk/router/payment transport. It rejects outbound browser requests and closes its owned services. It is not a complete real Next/Clerk/Stripe session.

```text
node run-validation.cjs coverage coverage-new
node run-validation.cjs build build-new
node run-validation.cjs lint lint-new
node run-mongo.cjs mongo-new
node run-browser.cjs shop-quantity-new
```

Lint excludes generated `output/playwright/**` bundles (including bundled React), not application source. Initial failed receipts are preserved alongside the successful reruns. Browser screenshots are synthetic and must not be described as live stock or a real order.

## Remaining activation/release decisions

1. Integration owner selects this scoped patch against the then-current approved production base after the Friday release. Do not substitute the broad held classroom/shop candidate. Re-run integration gates on that combined source.
2. Review canonical stock and variant records before enabling automatic allocation; unknown/infinite stock must not be fabricated. Existing native/Sheet/bulk inventory is not automatically synchronized into Mongo by this patch.
3. Confirm transaction-capable production Mongo capacity/backups and approve the two collections. Provision non-TTL indexes for allocation lookups (`status, productIds`, and `userId, status`) and audit lookups (`orderId, cartItemId, at`). No provisioning is performed by this handoff.
4. Reconcile every already-payable pre-feature Stripe session before activation. Mixed old payable sessions can otherwise become paid-but-unfulfillable reconciliation cases. Keep manual/native PayNow and any other stock-writing checkout path inactive until it participates in the same allocation policy.
5. Assign an owner procedure for held attempts, provider outages, abandoned expired sessions, late payments and refunds. No automatic TTL release is safe for an unknown payment. Existing buyer checkout recovery/cancellation can release a verified expired/unpaid session; an independent owner reconciliation UI/job is not included. Do not clear holds by deleting records or changing status from a timer.
6. In an explicitly approved staging environment, verify real Clerk owner/customer/guest boundaries and Stripe test-mode payment, async completion, lost response, expiry and webhook retry. No live card or production payment test was performed or is authorized by this patch. Notification delivery remains unverified and unchanged; the owner must handle the promised non-restockable-item contact through the separately approved workflow.
7. Approve the exact release and then the existing-server configuration flag `FIT_SHOP_BACKORDERS_ENABLED=true`. It defaults off. Rollback can disable new allocations while keeping these handlers to resolve already-created allocation contracts; reverting the handlers with outstanding attempts is unsafe. No new secret, provider, permission or security configuration is required.

The original inventory tunnel remains untouched. Original stock, orders, source records and protected/classroom checkouts remain preserved.
