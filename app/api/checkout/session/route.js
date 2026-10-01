import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { clerkClient } from '@clerk/nextjs/server';
import { connectToDatabase } from '@/lib/db';
import { cartIdentity, cartOwner } from '@/lib/cartOwner';
import Product from '@/models/Product';
import { checkoutIntent, findAttempt, resumeAttempt, createAttempt, adoptLegacyAttempt, cancelAttempt, CheckoutAttemptError } from '@/lib/checkoutAttempt';
import CustomPrintRequest from '@/models/CustomPrintRequest';
import { calculateCartItemBreakdown } from '../calculateBreakdown';
import { checkoutDiscountRules } from '@/lib/checkoutDiscounts';
import { applyShopShipping } from '@/lib/shopShipping';
import { customPrintChargeBreakdown } from '@/lib/customPrintDisplayPrice';
import { buildProductPrintRequestInput, colourNameFromVariants } from '@/lib/customPrint/productRequest';
import { buildCheckoutItem, checkoutPlain } from '@/lib/checkoutSnapshot';
import { checkAdminPrivileges } from '@/lib/checkPrivileges';
import { verifyCheckoutTransactions, CheckoutTransactionUnavailableError } from '@/lib/checkoutTransactionReadiness';
import { getFilamentAvailability, rushAvailability } from '@/lib/filamentInventory';
import { storeDeadline } from '@/lib/storeDeadline';
import { isAddressComplete, lineNeedsDeliveryAddress, pickDeliveryOptionMessage } from '@/lib/checkoutAddressGate';

// calculateCartItemBreakdown and customPrintChargeBreakdown throw this when
// the cart's chosenDeliveryType is not one the product/request offers.
const isDeliveryTypeMismatch = (error) => /Unknown delivery type/.test(error?.message || '');



export async function POST(req) {
    try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-05-28.basil', timeout: 10000, maxNetworkRetries: 1 });
        const identity = await cartIdentity(req);
        const { userId } = identity;
        if (!userId) return NextResponse.json({ error: 'Open your cart before checking out.' }, { status: 401 });
        const database = await connectToDatabase();
        async function verifyPaymentReady() {
            if (!process.env.STRIPE_SESSION_COMPLETE_SIGNING_SECRET?.trim()) {
                throw new CheckoutAttemptError('Checkout is temporarily unavailable. Please try again later.', 'checkout_webhook_not_configured', 503);
            }
            await verifyCheckoutTransactions(database);
        }
        const user = await cartOwner(identity);
        const requestedId = req?.headers?.get('X-Checkout-Attempt');
        if (requestedId && !/^[a-f0-9-]{36}$/.test(requestedId)) return NextResponse.json({ error: 'Invalid checkout attempt.' }, { status: 400 });
        if (requestedId) {
            const existing = await findAttempt(userId, requestedId);
            if (existing) {
                await verifyPaymentReady();
                return NextResponse.json(await resumeAttempt(stripe, existing));
            }
            if (user?.checkoutIntent !== requestedId) return NextResponse.json({ error: 'This checkout is no longer available. Return to your cart.', code: 'checkout_expired' }, { status: 409 });
        }
        if (user?.checkoutIntent) {
            const existing = await findAttempt(userId, user.checkoutIntent);
            if (existing) {
                await verifyPaymentReady();
                return NextResponse.json(await resumeAttempt(stripe, existing));
            }
        }
        if (!user?.cart?.length) return NextResponse.json({ error: 'Your cart is empty' }, { status: 400 });
        if (user.cart.length > 50) return NextResponse.json({ error: 'Too many cart items' }, { status: 400 });
        const address = identity.guest ? user.guestContact?.address : user.contact?.address;
        const needsAddress = user.cart.some(item => lineNeedsDeliveryAddress(item.chosenDeliveryType));
        if (needsAddress && !isAddressComplete(address)) return NextResponse.json({ error: 'Add a complete delivery address to pay.', code: 'checkout_address_required' }, { status: 400 });
        const customer = identity.guest ? null : await storeDeadline((async () => (await clerkClient()).users.getUser(userId))());
        const email = identity.guest ? user.guestContact?.email : customer.emailAddresses?.[0]?.emailAddress;
        const name = identity.guest ? user.guestContact?.name : [customer.firstName, customer.lastName].filter(Boolean).join(' ') || email;
        if (!email || !name) return NextResponse.json({ error: 'Enter your contact details before payment.' }, { status: 400 });
        const items = [];
        const line_items = [];
        const salesData = {};
        const digitalProductData = {};
        const requestIds = new Set();
        const sellerChecks = new Map();
        const stockTotals = new Map();
        const pendingItems = [];
        const extraDiscountRules = await checkoutDiscountRules();

        function reserveStock(key, quantity, available) {
            if (available == null) return true;
            const total = (stockTotals.get(key) || 0) + quantity;
            stockTotals.set(key, total);
            return Number.isFinite(available) && available >= total;
        }

        for (const cartItem of user.cart) {
            const item = checkoutPlain(cartItem);
            if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) {
                return NextResponse.json({ error: 'Invalid item quantity' }, { status: 400 });
            }
            let product, breakdown, customRequest, productPrintInput;
            if (identity.guest && (String(item.productId).startsWith('custom-print:') || ['digital', 'printDelivery'].includes(item.chosenDeliveryType))) {
                return NextResponse.json({ error: 'Please sign in to order this item.' }, { status: 401 });
            }
            if (String(item.productId).startsWith('custom-print:')) {
                const requestId = item.requestId || item.productId.split(':')[1];
                if (requestIds.has(requestId)) return NextResponse.json({ error: 'Duplicate print request' }, { status: 400 });
                requestIds.add(requestId);
                customRequest = await CustomPrintRequest.findOne({ requestId, userId }).lean();
                if (!customRequest || !['quoted', 'payment_pending'].includes(customRequest.status) || item.quantity !== 1) {
                    return NextResponse.json({ error: 'This print request is not ready for payment' }, { status: 409 });
                }
                // Creator jobs use seller-arranged payments until payouts exist.
                if (customRequest.creatorUserId) return NextResponse.json({ error: 'Arrange payment with this print provider directly' }, { status: 409 });
                if (customRequest.quoteMode === 'instant' &&
                    (customRequest.quote?.inputs?.options?.priority || customRequest.quote?.inputs?.options?.expedite)) {
                    let colours;
                    try { colours = await getFilamentAvailability(); }
                    catch { return NextResponse.json({ error: 'Rush availability cannot be checked right now. Try again shortly.' }, { status: 503 }); }
                    const filament = customRequest.printConfiguration?.printSettings?.filamentType || 'pla';
                    const colour = customRequest.printConfiguration?.generic?.colour;
                    if (rushAvailability(colours, filament, colour) !== 'in_stock')
                        return NextResponse.json({ error: 'The selected colour is no longer available for rush or priority. Choose another colour before payment.' }, { status: 409 });
                }
                product = await Product.findOne({ slug: 'custom-print-request' }).lean();
                if (!product) return NextResponse.json({ error: 'Custom printing is not configured' }, { status: 409 });
                let charge;
                try {
                    charge = customPrintChargeBreakdown(customRequest, item.chosenDeliveryType);
                } catch (error) {
                    if (isDeliveryTypeMismatch(error)) return NextResponse.json({ error: pickDeliveryOptionMessage(product.name) }, { status: 409 });
                    throw error;
                }
                breakdown = {
                    quantity: 1, price: charge.amount, priceBeforeDiscount: charge.amount,
                    basePrice: Number(customRequest.basePrice || 0), variantInfo: [],
                    chosenDeliveryType: charge.chosenDeliveryType, deliveryFee: charge.deliveryFee,
                    currency: charge.currency,
                };
            } else {
                // Use private server data; public product responses omit paid files.
                product = await Product.findById(item.productId).select('+shippingCosts +googleReviewAvailability').lean();
                if (product?.quoteOnly) {
                    return NextResponse.json({ error: 'Please contact us to confirm the price and availability of this item before ordering.' }, { status: 409 });
                }
                if (!product || product.hidden || product.flaggedForModeration || (identity.guest && product.productType !== 'shop')) {
                    return NextResponse.json({ error: 'A product is no longer available' }, { status: 409 });
                }
                // Funds currently settle to FIT. Independent creator products
                // cannot use this checkout until their payout flow exists.
                if (product.listing !== 'fit') {
                    if (!sellerChecks.has(product.creatorUserId)) {
                        sellerChecks.set(product.creatorUserId, await storeDeadline(checkAdminPrivileges(product.creatorUserId)));
                    }
                    if (!sellerChecks.get(product.creatorUserId)) {
                        return NextResponse.json({ error: 'Online payment for this creator is not available. Contact the seller to arrange your order.' }, { status: 409 });
                    }
                }
                if (!product.infiniteStock && !reserveStock(`product:${product._id}`, item.quantity, product.stock)) {
                    return NextResponse.json({ error: 'The requested quantity is not in stock' }, { status: 409 });
                }
                if (product.variantTypes?.some(type => !item.selectedVariants?.[type.name])) {
                    return NextResponse.json({ error: 'Choose an option for every product variant' }, { status: 400 });
                }
                for (const [type, option] of Object.entries(item.selectedVariants || {})) {
                    const selection = product.variantTypes?.find(v => v.name === type)?.options?.find(o => o.name === option);
                    if (!selection) {
                        return NextResponse.json({ error: 'A selected product option is no longer available' }, { status: 409 });
                    }
                    if (!product.infiniteStock && !reserveStock(`variant:${product._id}:${type}:${option}`, item.quantity, selection.stock)) {
                        return NextResponse.json({ error: 'The selected option is not in stock' }, { status: 409 });
                    }
                }
                try {
                    breakdown = await calculateCartItemBreakdown({ item, product, address, extraDiscountRules });
                } catch (error) {
                    if (isDeliveryTypeMismatch(error)) return NextResponse.json({ error: pickDeliveryOptionMessage(product.name) }, { status: 409 });
                    throw error;
                }
                if (item.chosenDeliveryType === 'printDelivery' && product.productType === 'print') {
                    productPrintInput = buildProductPrintRequestInput({ product,
                        chosenColour: colourNameFromVariants(item.selectedVariants),
                        user: { userId, email, name } });
                    delete productPrintInput.quoteSettings;
                }
            }
            pendingItems.push({ item, product, breakdown, customRequest, productPrintInput });
        }
        applyShopShipping(pendingItems, address);
        for (const pending of pendingItems) {
            const snapshot = buildCheckoutItem(pending);
            items.push(snapshot);
            line_items.push({ price_data: { currency: 'sgd', unit_amount: snapshot.unitAmount,
                product_data: { name: snapshot.productName } }, quantity: snapshot.quantity });
            if (snapshot.deliveryAmount) line_items.push({ price_data: { currency: 'sgd', unit_amount: snapshot.deliveryAmount,
                product_data: { name: `Delivery for ${snapshot.productName}` } }, quantity: 1 });
            const creator = snapshot.creatorUserId;
            salesData[creator] ||= { totalAmount: 0, productRevenue: 0, shippingRevenue: 0, items: [] };
            salesData[creator].totalAmount += snapshot.totalAmount;
            salesData[creator].productRevenue += snapshot.unitAmount * snapshot.quantity;
            salesData[creator].shippingRevenue += snapshot.deliveryAmount;
            salesData[creator].items.push({ productId: snapshot.productId, quantity: snapshot.quantity,
                unitPrice: snapshot.unitAmount / 100, deliveryFee: snapshot.deliveryAmount / 100,
                deliveryType: snapshot.chosenDeliveryType });
            if (snapshot.paidAssets.length) digitalProductData[snapshot.productId] = { buyer: userId, links: snapshot.paidAssets };
        }
        const totalAmount = items.reduce((sum, item) => sum + item.totalAmount, 0);
        if (!totalAmount) return NextResponse.json({ error: 'Free product checkout is not available yet. Please contact FIT to obtain this item.' }, { status: 409 });
        // Fulfilment requires MongoDB transactions. Verify support before a
        // payable session exists, so unsupported deployments cannot take money.
        await verifyPaymentReady();
        const attemptId = await checkoutIntent(user);
        const legacy = await adoptLegacyAttempt(stripe, userId, attemptId);
        if (legacy) return NextResponse.json(legacy);
        const stripeParams = {
            payment_method_types: ['card', 'paynow'], line_items, mode: 'payment', ui_mode: 'custom',
            return_url: `${process.env.NEXT_PUBLIC_BASE_URL}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
            metadata: { userId, checkoutAttemptId: attemptId },
            ...(customer?.publicMetadata?.stripeCustomerId ? { customer: customer.publicMetadata.stripeCustomerId } : { customer_email: email }),
        };
        const snapshot = { userId, snapshotVersion: 1,
            items, totalAmount, currency: 'sgd', salesData, digitalProductData,
            shippingAddress: address ? checkoutPlain(address) : null, customerEmail: email, customerName: name };
        return NextResponse.json(await createAttempt(stripe, { attemptId, userId, snapshot, stripeParams }));
    } catch (error) {
        if (error instanceof CheckoutAttemptError || error instanceof CheckoutTransactionUnavailableError) {
            return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
        }
        console.error('Checkout creation failed:', error);
        return NextResponse.json({ error: 'Unable to create checkout. Please review your cart and try again.' }, { status: 503 });
    }
}

export async function DELETE(req) {
    try {
        const identity = await cartIdentity(req);
        if (!identity.userId) return NextResponse.json({ error: 'Open your cart before continuing.' }, { status: 401 });
        const attemptId = req.headers.get('X-Checkout-Attempt');
        if (!/^[a-f0-9-]{36}$/.test(attemptId || '')) return NextResponse.json({ error: 'Invalid checkout attempt.' }, { status: 400 });
        await connectToDatabase();
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-05-28.basil', timeout: 10000, maxNetworkRetries: 1 });
        return NextResponse.json(await cancelAttempt(stripe, identity.userId, attemptId));
    } catch (error) {
        if (error instanceof CheckoutAttemptError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
        return NextResponse.json({ error: 'Could not confirm that payment was cancelled. Check payment status before editing.' }, { status: 503 });
    }
}
