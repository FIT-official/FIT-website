import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Product from "@/models/Product";
import { checkoutIntent } from "@/lib/checkoutAttempt";
import { cartIdentity, cartOwner, withCartCookie } from "@/lib/cartOwner";

export async function POST(req) {
    try {
        const identity = await cartIdentity(req, { create: true });

        await connectToDatabase();
        const { cartItem } = await req.json();
        if (!cartItem || !cartItem.productId || !cartItem.chosenDeliveryType) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }
        // Print requests reach the cart only through /api/cart/custom-print,
        // which checks ownership, the quote and that it is not a creator job.
        if (String(cartItem.productId).startsWith("custom-print:")) {
            return NextResponse.json({ error: "Use Add to cart on the print request page." }, { status: 409 });
        }

        const user = await cartOwner(identity, { create: true });
        if (!user) return NextResponse.json({ error: "Your account cart is unavailable. Please sign in again." }, { status: 401 });
        if (!Number.isSafeInteger(cartItem.quantity ?? 1) || cartItem.quantity === 0 || Math.abs(cartItem.quantity ?? 1) > 100) {
            return NextResponse.json({ error: "Invalid quantity" }, { status: 400 });
        }
        if (identity.guest) {
            if (!/^[a-f0-9]{24}$/i.test(cartItem.productId)) return NextResponse.json({ error: "Invalid product" }, { status: 400 });
            const product = await Product.findById(cartItem.productId).lean();
            if (!product || product.hidden || product.flaggedForModeration || product.productType !== 'shop' || product.listing === 'creator' ||
                ['digital', 'printDelivery'].includes(cartItem.chosenDeliveryType)) {
                return NextResponse.json({ error: "This item is not available for guest checkout." }, { status: 409 });
            }
            if (!product.delivery?.deliveryTypes?.some(d => d.type === cartItem.chosenDeliveryType)) {
                return NextResponse.json({ error: "Choose an available delivery option." }, { status: 400 });
            }
            if (product.variantTypes?.some(v => !v.options?.some(o => o.name === cartItem.selectedVariants?.[v.name]))) {
                return NextResponse.json({ error: "Choose an option for every product variant." }, { status: 400 });
            }
        }

        const normalizeSelectedVariants = (value) => {
            if (!value) return {};
            const obj = value instanceof Map ? Object.fromEntries(value.entries()) : value;
            if (!obj || typeof obj !== "object") return {};
            const sorted = {};
            for (const key of Object.keys(obj).sort()) {
                sorted[key] = obj[key];
            }
            return sorted;
        };

        // Helper function to compare selectedVariants Maps
        const selectedVariantsMatch = (item1, item2) => {
            const variants1 = normalizeSelectedVariants(item1.selectedVariants);
            const variants2 = normalizeSelectedVariants(item2.selectedVariants);
            return JSON.stringify(variants1) === JSON.stringify(variants2);
        };

        const existingIndex = user.cart.findIndex(
            item =>
                item.productId === cartItem.productId &&
                item.variantId === (cartItem.variantId || null) &&
                item.chosenDeliveryType === cartItem.chosenDeliveryType &&
                selectedVariantsMatch(item, cartItem)
        );

        if (existingIndex !== -1) {
            user.cart[existingIndex].quantity += cartItem.quantity || 1;
        } else {
            user.cart.push({
                productId: cartItem.productId,
                quantity: cartItem.quantity || 1,
                variantId: cartItem.variantId || null,
                selectedVariants: cartItem.selectedVariants || new Map(),
                chosenDeliveryType: cartItem.chosenDeliveryType,
                price: cartItem.price || 0,
                orderNote: cartItem.orderNote || "",
            });
        }

        if (user.cart.length > 50 || user.cart.some(item => item.quantity < 1 || item.quantity > 100)) {
            return NextResponse.json({ error: "Choose between 1 and 100 units, with up to 50 cart items." }, { status: 400 });
        }
        await user.save();
        return withCartCookie(NextResponse.json({ success: true, cart: user.cart, guest: identity.guest, checkoutAttemptId: user.checkoutIntent }), identity);
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}

export async function GET(req) {
    try {
        const identity = await cartIdentity(req, { create: true });
        await connectToDatabase();

        const user = await cartOwner(identity, { create: true });
        if (!user) return NextResponse.json({ error: "Your account cart is unavailable. Please sign in again." }, { status: 401 });
        const intent = user.cart.length ? await checkoutIntent(user) : user.checkoutIntent;
        return withCartCookie(NextResponse.json({ cart: user.cart, guest: identity.guest,
            ...(identity.guest ? { guestContact: user.guestContact || null } : {}),
            checkoutAttemptId: intent, contactReady: !identity.guest || !!(user.guestContact?.email && user.guestContact?.address?.country) }), identity);
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}

export async function DELETE(req) {
    try {
        const identity = await cartIdentity(req);
        await connectToDatabase();
        const { productId, variantId, selectedVariants } = await req.json();
        if (!productId) {
            return NextResponse.json({ error: "Missing product" }, { status: 400 });
        }

        const normalizeSelectedVariants = (value) => {
            if (!value) return {};
            const obj = value instanceof Map ? Object.fromEntries(value.entries()) : value;
            if (!obj || typeof obj !== "object") return {};
            const sorted = {};
            for (const key of Object.keys(obj).sort()) {
                sorted[key] = obj[key];
            }
            return sorted;
        };

        // Helper function to compare selectedVariants Maps
        const selectedVariantsMatch = (item1, item2) => {
            const variants1 = normalizeSelectedVariants(item1.selectedVariants);
            const variants2 = normalizeSelectedVariants(item2.selectedVariants);
            return JSON.stringify(variants1) === JSON.stringify(variants2);
        };

        const user = await cartOwner(identity);
        if (!user) return NextResponse.json({ error: "Your cart has expired. Please return to the shop." }, { status: 401 });
        user.cart = user.cart.filter(
            item => {
                // Custom print lines (custom-print:<requestId>) carry no
                // variants, so they match by productId alone.
                if (String(productId).startsWith('custom-print:') || String(item.productId || '').startsWith('custom-print:')) {
                    return item.productId !== productId;
                }

                // For legacy system compatibility, if no selectedVariants provided, use variantId matching
                if (!selectedVariants && !item.selectedVariants) {
                    return !(item.productId === productId && (item.variantId || null) === (variantId || null));
                }
                // For new variant system, match both productId and selectedVariants
                return !(item.productId === productId && selectedVariantsMatch(item, { selectedVariants: selectedVariants || {} }));
            }
        );
        await user.save({ validateModifiedOnly: true });
        return NextResponse.json({ success: true, cart: user.cart }, { status: 200 });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
