import { NextResponse } from "next/server";
import Stripe from "stripe";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import Product from "@/models/Product";
import CheckoutSession from "@/models/CheckoutSession";
import Order from "@/models/Order";
import CustomPrintRequest from "@/models/CustomPrintRequest";
import AppSettings from "@/models/AppSettings";
import { getAppSettingsId } from "@/lib/appSettingsId";
import { buildProductPrintRequestInput, colourNameFromVariants } from "@/lib/customPrint/productRequest";
import { computeProductPrintQuote } from "@/lib/customPrint/productQuote";
import { customPrintChargeBreakdown } from "@/lib/customPrintDisplayPrice";
import { randomUUID } from "crypto";
import { sendEmail } from "@/lib/email";
import { buildNewSaleEmail, buildOrderConfirmationEmail } from "@/lib/email/templates/transactional";
import { notifyCustomPrintEvent } from "@/lib/notifications/customPrint";
import { clerkClient } from "@clerk/nextjs/server";
import { getPostHogClient } from "@/lib/posthog-server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-05-28.basil",
});

const webhookSecret = process.env.STRIPE_SESSION_COMPLETE_SIGNING_SECRET;

// A request already at `paid` or later has already been fulfilled by an
// earlier session; a second session referencing the same requestId (e.g. a
// retried checkout) must not overwrite its payment fields or re-notify.
const FULFILLED_CUSTOM_PRINT_STATUSES = ['paid', 'printing', 'printed', 'shipped', 'delivered'];

export const dynamic = 'force-dynamic';

// Records the sale and decrements stock via a single guarded atomic update
// (never a read-then-save round trip), so two concurrent/retried webhook
// deliveries can't both decrement from the same stale in-memory snapshot and
// oversell. Each stock field's `$inc` carries its own `>= qty` guard; a field
// whose guard fails is simply left unchanged (never forced negative) rather
// than blocking the rest of fulfilment — the sale is always recorded.
async function recordSaleAndDecrementStock(product, { userId, item }) {
    const qty = item.quantity || 1;
    const salesEntry = { userId, quantity: item.quantity, price: item.price || 0 };

    if (product.infiniteStock) {
        await Product.updateOne({ _id: product._id }, { $push: { sales: salesEntry } });
        return;
    }

    const incFields = {};
    const arrayFilters = [];

    if (item.selectedVariants && Object.keys(item.selectedVariants).length > 0 && product.variantTypes) {
        let idx = 0;
        for (const [variantTypeName, selectedOption] of Object.entries(item.selectedVariants)) {
            const variantType = product.variantTypes.find(vt => vt.name === variantTypeName);
            const option = variantType?.options.find(opt => opt.name === selectedOption);
            if (option && option.stock !== undefined && option.stock !== null) {
                const vtId = `vt${idx}`;
                const optId = `opt${idx}`;
                incFields[`variantTypes.$[${vtId}].options.$[${optId}].stock`] = -qty;
                arrayFilters.push({ [`${vtId}._id`]: variantType._id });
                arrayFilters.push({ [`${optId}._id`]: option._id, [`${optId}.stock`]: { $gte: qty } });
                idx++;
            }
        }
    }

    const filter = { _id: product._id };
    if (product.stock !== undefined && product.stock !== null) {
        incFields.stock = -qty;
        filter.stock = { $gte: qty };
    }

    let updated = null;
    if (Object.keys(incFields).length > 0) {
        updated = await Product.findOneAndUpdate(
            filter,
            { $inc: incFields, $push: { sales: salesEntry } },
            { new: true, ...(arrayFilters.length ? { arrayFilters } : {}) },
        );
    }

    if (!updated) {
        // Guard failed (insufficient stock at the moment of update) or there
        // was nothing to decrement — still record the sale so revenue stays
        // accurate; never block fulfilment on a stock-tracking mismatch.
        console.error(`Stock guard failed or no stock fields to decrement for product ${product._id}; recording sale without stock change.`);
        await Product.updateOne({ _id: product._id }, { $push: { sales: salesEntry } });
    }
}

export async function POST(req) {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    let event;

    try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return NextResponse.json(
            { error: `Webhook Error: ${err.message}` },
            { status: 400 }
        );
    }

    // Handle the checkout.session.completed event
    if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        // Released (in the `finally` below) on every path that doesn't reach
        // full success, so a Stripe retry can always re-attempt fulfilment —
        // including a failure introduced by future code changes, not just the
        // ones anticipated here.
        let claimed = false;
        let succeeded = false;
        const releaseClaim = () =>
            CheckoutSession.updateOne({ sessionId: session.id }, { processed: false })
                .catch((err) => console.error('Failed to release webhook claim:', err));

        try {
            await connectToDatabase();

            // Atomically claim the session so a redelivered event can never
            // re-run fulfilment (stock decrements, Order creation, emails).
            // Same claim-lock idiom as lib/newsletter/dispatch.js.
            const checkoutSessionData = await CheckoutSession.findOneAndUpdate(
                { sessionId: session.id, processed: { $ne: true } },
                { processed: true },
                { new: true },
            );

            if (!checkoutSessionData) {
                const existing = await CheckoutSession.findOne({ sessionId: session.id });
                if (existing?.processed) {
                    // Duplicate delivery of an already-fulfilled session.
                    return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
                }
                console.error(`CheckoutSession not found for sessionId: ${session.id}`);
                return NextResponse.json(
                    { error: "Checkout session not found" },
                    { status: 404 }
                );
            }
            claimed = true;

            const userId = checkoutSessionData.userId;
            const user = await User.findOne({ userId });

            if (!user) {
                console.error(`User not found for userId: ${userId}`);
                return NextResponse.json(
                    { error: "User not found" },
                    { status: 404 }
                );
            }

            // Create order history entries and handle print orders
            const orders = [];
            const orderItems = []; // For the new Order model

            // Fetch payment method details from Stripe (best-effort). Current
            // API versions expose the charge via `latest_charge` (expanded),
            // not the removed `charges` list.
            let paymentMethodDetails = null;
            try {
                if (session.payment_intent) {
                    const paymentIntent = await stripe.paymentIntents.retrieve(
                        session.payment_intent,
                        { expand: ['latest_charge'] },
                    );
                    const paymentMethod = paymentIntent?.latest_charge?.payment_method_details;

                    if (paymentMethod) {
                        paymentMethodDetails = {
                            type: paymentMethod.type,
                            brand: paymentMethod.card?.brand || paymentMethod.type,
                            last4: paymentMethod.card?.last4 || null,
                            expiryMonth: paymentMethod.card?.exp_month || null,
                            expiryYear: paymentMethod.card?.exp_year || null
                        };
                    }
                }
            } catch (error) {
                console.error('Error fetching payment method details:', error);
            }

            // Get shipping address from session
            const shippingAddress = session.shipping_details?.address || null;

            // Load the base product used to represent custom print requests in orders
            const customPrintBaseProduct = await Product.findOne({ slug: 'custom-print-request' });

            // Server pricing config for product-print fixed quotes (best-effort).
            const appSettings = await AppSettings.findById(getAppSettingsId()).lean();

            for (const item of user.cart) {
                let product = null;
                let customPrintRequest = null;
                let isCustomPrint = false;
                let customPrintQuotedPrice = null;
                let customPrintDeliveryFee = null;
                let customPrintChosenDeliveryType = null;

                if (String(item.productId || '').startsWith('custom-print:')) {
                    isCustomPrint = true;
                    const requestId = item.requestId || item.customPrintRequestId || (item.productId || '').split(':')[1];
                    // Scoped to the paying session's own user: a requestId that
                    // exists but belongs to someone else must be indistinguishable
                    // from an unknown requestId here (no ownership oracle, and no
                    // path for one user's payment to fulfil another's request).
                    customPrintRequest = await CustomPrintRequest.findOne({ requestId, userId });

                    if (customPrintRequest) {
                        const alreadyFulfilled = FULFILLED_CUSTOM_PRINT_STATUSES.includes(customPrintRequest.status);

                        if (!alreadyFulfilled) {
                            // Update custom print request status to paid
                            customPrintRequest.status = 'paid';
                            customPrintRequest.stripeSessionId = session.id;
                            customPrintRequest.stripePaymentIntentId = session.payment_intent;
                            customPrintRequest.paidAt = new Date();
                            customPrintRequest.statusHistory.push({
                                status: 'paid',
                                note: 'Payment completed via Stripe checkout',
                            });
                            await customPrintRequest.save();
                        }

                        // Use the configured base product for order linkage
                        product = customPrintBaseProduct;

                        // Quoted pricing + delivery, same selector the cart
                        // displays and checkout charges (instant → quote.total,
                        // manual → basePrice + printFee).
                        const charge = customPrintChargeBreakdown(customPrintRequest, item.chosenDeliveryType || '');
                        customPrintQuotedPrice = charge.amount;
                        customPrintChosenDeliveryType = charge.chosenDeliveryType;
                        customPrintDeliveryFee = charge.deliveryFee;

                        if (!alreadyFulfilled) {
                            // Payment received → notify the customer (queued) and
                            // the admin (start work) by email, and post a chat update
                            // into the buyer↔vendor thread. Best-effort; never break
                            // webhook processing on a notification failure.
                            try {
                                await notifyCustomPrintEvent({
                                    event: 'paid',
                                    request: customPrintRequest.toObject(),
                                    product: customPrintBaseProduct,
                                    breakdown: { ...charge, lines: customPrintRequest.quote?.lines },
                                });
                            } catch (notifyErr) {
                                console.error('Paid notification failed:', notifyErr);
                            }
                        }
                    }
                } else {
                    product = await Product.findById(item.productId);
                }

                if (!product) {
                    console.error(`Product not found: ${item.productId}`);
                    continue;
                }

                // Build variant info
                let variantInfo = [];
                let variantFees = 0;
                if (item.selectedVariants && Object.keys(item.selectedVariants).length > 0) {
                    if (product.variantTypes && product.variantTypes.length > 0) {
                        for (const [variantTypeName, selectedOption] of Object.entries(item.selectedVariants)) {
                            const variantType = product.variantTypes.find(vt => vt.name === variantTypeName);
                            if (variantType) {
                                const option = variantType.options.find(opt => opt.name === selectedOption);
                                if (option) {
                                    variantInfo.push({
                                        type: variantTypeName,
                                        option: selectedOption,
                                        additionalFee: option.additionalFee || 0
                                    });
                                    variantFees += option.additionalFee || 0;
                                }
                            }
                        }
                    }
                }

                // Calculate pricing breakdown
                let basePrice, priceBeforeDiscount, discount, finalPrice, deliveryFee, totalPrice, currency;

                if (isCustomPrint && customPrintRequest) {
                    const computedQuoted = Number(customPrintQuotedPrice ?? (Number(customPrintRequest.basePrice || 0) + Number(customPrintRequest.printFee || 0)));
                    const computedDelivery = Number(customPrintDeliveryFee ?? 0);
                    basePrice = Number(customPrintRequest.basePrice || 0);
                    priceBeforeDiscount = computedQuoted;
                    discount = 0;
                    finalPrice = computedQuoted;
                    deliveryFee = computedDelivery;
                    totalPrice = computedQuoted + computedDelivery;
                    currency = (customPrintRequest.currency || 'SGD');
                } else {
                    basePrice = product.basePrice?.presentmentAmount || 0;
                    priceBeforeDiscount = basePrice + variantFees;
                    discount = (item.priceBeforeDiscount || priceBeforeDiscount) - (item.finalPrice || priceBeforeDiscount);
                    finalPrice = item.finalPrice || priceBeforeDiscount;
                    deliveryFee = item.deliveryFee || 0;
                    totalPrice = item.price || (finalPrice + deliveryFee);
                    currency = item.currency || product.basePrice?.presentmentCurrency || 'SGD';
                }

                // Create order item for new Order model
                orderItems.push({
                    productId: isCustomPrint ? product._id : item.productId,
                    productName: isCustomPrint ? `Custom 3D Print - ${customPrintRequest?.requestId}` : product.name,
                    productSlug: isCustomPrint ? 'custom-print' : product.slug,
                    quantity: item.quantity || 1,
                    selectedVariants: item.selectedVariants || {},
                    variantInfo: variantInfo,
                    basePrice: basePrice,
                    variantFees: isCustomPrint ? 0 : variantFees,
                    priceBeforeDiscount: priceBeforeDiscount,
                    discount: discount,
                    finalPrice: finalPrice,
                    deliveryFee: deliveryFee,
                    totalPrice: totalPrice,
                    currency: currency,
                    chosenDeliveryType: isCustomPrint ? (customPrintChosenDeliveryType || item.chosenDeliveryType) : item.chosenDeliveryType,
                    orderNote: item.orderNote || "",
                    requestId: isCustomPrint ? customPrintRequest?.requestId : item.requestId || null,
                    reviewed: false,
                    reviewId: null
                });

                // Add to order history with complete pricing breakdown (keep for backward compatibility)
                orders.push({
                    cartItem: {
                        productId: isCustomPrint ? String(product?._id || item.productId) : item.productId,
                        quantity: item.quantity,
                        selectedVariants: item.selectedVariants || {},
                        chosenDeliveryType: isCustomPrint ? (customPrintChosenDeliveryType || item.chosenDeliveryType) : item.chosenDeliveryType,
                        orderNote: item.orderNote || "", // Include customer's order note
                        price: totalPrice, // Total price paid (final + delivery)
                        finalPrice: finalPrice, // Price after discount, before delivery
                        basePrice: basePrice, // Base price without variants
                        priceBeforeDiscount: priceBeforeDiscount, // Base + variants before discount
                        variantInfo: variantInfo, // Array of variant selections with fees
                        deliveryFee: deliveryFee,
                        currency: currency,
                        requestId: isCustomPrint ? (customPrintRequest?.requestId || null) : (item.requestId || null),
                    },
                    status: item.chosenDeliveryType === "digital" ? "delivered" : "pending",
                    stripeSessionId: session.id, // Store Stripe session ID for payment method retrieval
                });

                // Update product sales and decrement stock (skip for custom prints)
                if (!isCustomPrint) {
                    await recordSaleAndDecrementStock(product, { userId, item });
                }

                // Product-sourced print jobs become CustomPrintRequests (admin
                // queue + print-time/colour markers + email/chat lifecycle).
                // Custom uploads were already marked paid above. PrintOrder is
                // retired — no longer written. See openspec change
                // `migrate-print-delivery-to-custom-requests`.
                if (
                    item.chosenDeliveryType === "printDelivery" &&
                    !isCustomPrint &&
                    product?.productType === 'print' &&
                    product.viewableModel &&
                    product.printConfig
                ) {
                    // Charge = product base price + selected variant fees.
                    let variantFees = 0;
                    if (item.selectedVariants && product.variantTypes?.length > 0) {
                        for (const [variantTypeName, selectedOption] of Object.entries(item.selectedVariants)) {
                            const variantType = product.variantTypes.find(vt => vt.name === variantTypeName);
                            const option = variantType?.options.find(opt => opt.name === selectedOption);
                            if (option) variantFees += option.additionalFee || 0;
                        }
                    }
                    const chargeTotal = (product.basePrice?.presentmentAmount || 0) + variantFees;
                    try {
                        const input = buildProductPrintRequestInput({
                            product,
                            chosenColour: colourNameFromVariants(item.selectedVariants),
                            user: {
                                userId,
                                email: user.email,
                                name: user.name || session.customer_details?.name || user.email,
                            },
                            colourCatalogue: appSettings?.printColours || [],
                        });
                        let quote = null;
                        try {
                            quote = await computeProductPrintQuote({
                                product,
                                quoteSettings: input.quoteSettings,
                                pricingConfig: appSettings?.quotingConfig || {},
                                deliveryTypes: appSettings?.additionalDeliveryTypes || [],
                            });
                        } catch (quoteErr) {
                            console.error('Product print quote failed (non-fatal):', quoteErr);
                        }
                        const { quoteSettings, ...requestFields } = input;
                        const productRequest = await CustomPrintRequest.create({
                            requestId: randomUUID(),
                            ...requestFields,
                            basePrice: chargeTotal, // charge = product price
                            currency: (product.basePrice?.presentmentCurrency || 'SGD').toLowerCase(),
                            status: 'paid',
                            paidAt: new Date(),
                            stripeSessionId: session.id,
                            stripePaymentIntentId: session.payment_intent,
                            quote: quote || undefined,
                            quotedAt: quote ? new Date() : undefined,
                            statusHistory: [{ status: 'paid', note: 'Product print purchased via Stripe' }],
                        });
                        try {
                            await notifyCustomPrintEvent({
                                event: 'paid',
                                request: productRequest.toObject(),
                                product,
                                breakdown: {
                                    amount: chargeTotal,
                                    deliveryFee: item.deliveryFee || 0,
                                    total: chargeTotal + (item.deliveryFee || 0),
                                    currency: (product.basePrice?.presentmentCurrency || 'SGD').toUpperCase(),
                                    chosenDeliveryType: item.chosenDeliveryType,
                                    lines: quote?.lines,
                                },
                            });
                        } catch (notifyErr) {
                            console.error('Product print paid notification failed:', notifyErr);
                        }
                    } catch (reqErr) {
                        console.error('Failed to create product print CustomPrintRequest:', reqErr);
                    }
                }
            }

            // Reconciliation (openspec change reconcile-webhook-charge-amounts,
            // decision (b) 2026-07-05): fulfilment recomputes prices from the
            // LIVE cart/config, which can diverge from what Stripe captured if
            // anything changed mid-payment. Fulfil anyway (the customer paid),
            // but flag the order for admin review/refund/adjustment.
            const computedTotal = orderItems.reduce((sum, item) => sum + item.totalPrice, 0);
            const computedAmountCents = Math.round(computedTotal * 100);
            const stripeAmountCents = Number.isFinite(session.amount_total) ? session.amount_total : null;
            const amountMismatch =
                stripeAmountCents !== null && stripeAmountCents !== computedAmountCents
                    ? { stripeAmountCents, computedAmountCents }
                    : undefined;
            if (amountMismatch) {
                console.error(
                    `[webhook] amount mismatch for session ${session.id}: ` +
                        `Stripe captured ${stripeAmountCents}¢ but recomputed total is ${computedAmountCents}¢ — order flagged`,
                );
            }

            // Create the comprehensive Order record
            const orderId = `ORD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const newOrder = new Order({
                orderId: orderId,
                userId: userId,
                stripeSessionId: session.id,
                stripePaymentIntentId: session.payment_intent || null,
                paymentMethod: paymentMethodDetails,
                customerEmail: session.customer_details?.email || user.email || "",
                customerName: session.customer_details?.name || "",
                shippingAddress: shippingAddress ? {
                    line1: shippingAddress.line1 || "",
                    line2: shippingAddress.line2 || "",
                    city: shippingAddress.city || "",
                    state: shippingAddress.state || "",
                    postalCode: shippingAddress.postal_code || "",
                    country: shippingAddress.country || ""
                } : undefined,
                items: orderItems,
                subtotal: orderItems.reduce((sum, item) => sum + item.finalPrice, 0),
                totalDiscount: orderItems.reduce((sum, item) => sum + item.discount, 0),
                totalDelivery: orderItems.reduce((sum, item) => sum + item.deliveryFee, 0),
                totalAmount: computedTotal,
                currency: orderItems[0]?.currency || 'SGD',
                status: 'pending',
                amountMismatch,
                statusHistory: [{
                    status: 'pending',
                    timestamp: new Date(),
                    updatedBy: 'system',
                    note: amountMismatch
                        ? `Order created from successful checkout — NEEDS REVIEW: Stripe captured ` +
                          `${(amountMismatch.stripeAmountCents / 100).toFixed(2)} but recomputed total is ` +
                          `${(amountMismatch.computedAmountCents / 100).toFixed(2)}`
                        : 'Order created from successful checkout'
                }],
                customerNote: orderItems.map(item => item.orderNote).filter(Boolean).join('; ') || ""
            });

            await newOrder.save();

            // Customer order confirmation — sent HERE, where the Order now
            // exists, not from the return page (whose endpoint was an
            // unauthenticated open relay). The idempotency claim above means
            // Stripe retries can't double-send it. Best-effort.
            try {
                const confirmationTo = session.customer_details?.email || user.email;
                if (confirmationTo) {
                    const { subject, html } = buildOrderConfirmationEmail({
                        customerName: session.customer_details?.name || "",
                    });
                    await sendEmail({ to: confirmationTo, subject, html });
                }
            } catch (emailErr) {
                console.error("Order confirmation email failed:", emailErr);
            }

            try {
                const phog = getPostHogClient();
                phog.capture({
                    distinctId: userId,
                    event: 'order_created',
                    properties: {
                        order_id: orderId,
                        total_amount: newOrder.totalAmount,
                        currency: newOrder.currency,
                        item_count: orderItems.length,
                        has_custom_print: orderItems.some(item => item.productSlug === 'custom-print'),
                    },
                });
            } catch (phErr) {
                console.error('PostHog order_created capture failed:', phErr);
            }

            // Add orders to order history (keep for backward compatibility)
            user.orderHistory.push(...orders);

            // Empty the cart
            user.cart = [];
            await user.save();

            // Notify each creator about their sale
            try {
                const creatorSales = {};
                for (const item of orderItems) {
                    if (!item.productId) continue;
                    const prod = await Product.findById(item.productId);
                    if (!prod?.creatorUserId) continue;

                    if (!creatorSales[prod.creatorUserId]) {
                        creatorSales[prod.creatorUserId] = { items: [], total: 0 };
                    }
                    creatorSales[prod.creatorUserId].items.push({
                        name: item.productName,
                        quantity: item.quantity,
                        price: item.finalPrice,
                        currency: item.currency,
                    });
                    creatorSales[prod.creatorUserId].total += item.totalPrice;
                }

                for (const [creatorUserId, saleData] of Object.entries(creatorSales)) {
                    try {
                        const clerk = await clerkClient();
                        const creatorClerkUser = await clerk.users.getUser(creatorUserId);
                        const creatorEmail = creatorClerkUser?.emailAddresses?.[0]?.emailAddress;
                        if (!creatorEmail) continue;

                        const { subject, html } = buildNewSaleEmail({
                            total: saleData.total,
                            currency: saleData.items[0]?.currency || 'SGD',
                            items: saleData.items,
                        });
                        await sendEmail({ to: creatorEmail, subject, html });
                    } catch (emailErr) {
                        console.error(`Failed to email creator ${creatorUserId}:`, emailErr);
                    }
                }
            } catch (notifyErr) {
                console.error('Creator notification failed:', notifyErr);
            }

            // console.log(`Successfully processed checkout for userId: ${userId}, sessionId: ${session.id}`);

            succeeded = true;
            return NextResponse.json({ received: true }, { status: 200 });
        } catch (error) {
            console.error("Error processing webhook:", error);
            try {
                getPostHogClient().captureException(error, undefined, {
                    source: "stripe_webhook",
                    session_id: session.id,
                });
            } catch (phErr) {
                console.error("PostHog exception capture failed:", phErr);
            }
            return NextResponse.json(
                { error: "Failed to process webhook" },
                { status: 500 }
            );
        } finally {
            if (claimed && !succeeded) await releaseClaim();
        }
    }

    // Return 200 for other event types
    return NextResponse.json({ received: true }, { status: 200 });
}
