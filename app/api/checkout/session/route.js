import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { connectToDatabase } from '@/lib/db';
import User from '@/models/User';
import Product from '@/models/Product';
import CheckoutSession from '@/models/CheckoutSession';
import CustomPrintRequest from '@/models/CustomPrintRequest';
import { calculateCartItemBreakdown } from '../calculateBreakdown';
import { customPrintChargeBreakdown } from '@/lib/customPrintDisplayPrice';
import { buildProductPrintRequestInput, colourNameFromVariants } from '@/lib/customPrint/productRequest';
import { buildCheckoutItem, checkoutPlain } from '@/lib/checkoutSnapshot';
import { checkAdminPrivileges } from '@/lib/checkPrivileges';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-05-28.basil' });

export async function POST() {
    let stripeSession;
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        await connectToDatabase();
        const user = await User.findOne({ userId });
        if (!user?.cart?.length) return NextResponse.json({ error: 'Your cart is empty' }, { status: 400 });
        if (user.cart.length > 50) return NextResponse.json({ error: 'Too many cart items' }, { status: 400 });
        const address = user.contact?.address;
        if (!address?.country) return NextResponse.json({ error: 'Missing delivery address' }, { status: 400 });
        const client = await clerkClient();
        const customer = await client.users.getUser(userId);
        const email = customer.emailAddresses?.[0]?.emailAddress;
        const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || email;
        const items = [];
        const line_items = [];
        const salesData = {};
        const digitalProductData = {};
        const requestIds = new Set();
        const sellerChecks = new Map();
        const stockTotals = new Map();

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
                product = await Product.findOne({ slug: 'custom-print-request' }).lean();
                if (!product) return NextResponse.json({ error: 'Custom printing is not configured' }, { status: 409 });
                const charge = customPrintChargeBreakdown(customRequest, item.chosenDeliveryType);
                breakdown = {
                    quantity: 1, price: charge.amount, priceBeforeDiscount: charge.amount,
                    basePrice: Number(customRequest.basePrice || 0), variantInfo: [],
                    chosenDeliveryType: charge.chosenDeliveryType, deliveryFee: charge.deliveryFee,
                    currency: charge.currency,
                };
            } else {
                // Use private server data; public product responses omit paid files.
                product = await Product.findById(item.productId).lean();
                if (!product || product.hidden || product.flaggedForModeration) {
                    return NextResponse.json({ error: 'A product is no longer available' }, { status: 409 });
                }
                // Funds currently settle to FIT. Independent creator products
                // cannot use this checkout until their payout flow exists.
                if (product.listing !== 'fit') {
                    if (!sellerChecks.has(product.creatorUserId)) {
                        sellerChecks.set(product.creatorUserId, await checkAdminPrivileges(product.creatorUserId));
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
                breakdown = await calculateCartItemBreakdown({ item, product, address });
                if (item.chosenDeliveryType === 'printDelivery' && product.productType === 'print') {
                    productPrintInput = buildProductPrintRequestInput({ product,
                        chosenColour: colourNameFromVariants(item.selectedVariants),
                        user: { userId, email, name } });
                    delete productPrintInput.quoteSettings;
                }
            }
            const snapshot = buildCheckoutItem({ item, product, breakdown, customRequest, productPrintInput });
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
        stripeSession = await stripe.checkout.sessions.create({
            payment_method_types: ['card', 'paynow'], line_items, mode: 'payment', ui_mode: 'custom',
            return_url: `${process.env.NEXT_PUBLIC_BASE_URL}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
            metadata: { userId },
            ...(customer.publicMetadata?.stripeCustomerId ? { customer: customer.publicMetadata.stripeCustomerId } : { customer_email: email }),
        });
        if (!stripeSession.client_secret) throw new Error('Checkout session has no client secret');
        await CheckoutSession.create({ sessionId: stripeSession.id, userId, snapshotVersion: 1,
            items, totalAmount, currency: 'sgd', salesData, digitalProductData,
            shippingAddress: checkoutPlain(address), customerEmail: email, customerName: name });
        return NextResponse.json({ clientSecret: stripeSession.client_secret });
    } catch (error) {
        // A session whose purchase contract could not be saved must not stay payable.
        if (stripeSession?.id) await stripe.checkout.sessions.expire(stripeSession.id).catch(() => {});
        console.error('Checkout creation failed:', error);
        return NextResponse.json({ error: 'Unable to create checkout. Please review your cart and try again.' }, { status: 500 });
    }
}
