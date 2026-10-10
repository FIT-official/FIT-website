import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { cartIdentity, cartOwner } from "@/lib/cartOwner";
import Product from "@/models/Product";
import CustomPrintRequest from "@/models/CustomPrintRequest";
import { sanitizeString } from "@/utils/validate";
import { resolveDeliveryFee } from "@/lib/quoting/deliveryTypeResolver";
import { applyShopShipping } from '@/lib/shopShipping';
import { DELIVERY_QUOTE_MESSAGE } from '@/lib/shipping/weightTiers';
import { checkoutDiscountRules } from '@/lib/checkoutDiscounts';
import { calculateCartItemBreakdown } from '@/app/api/checkout/calculateBreakdown';
import { customPrintChargeBreakdown } from '@/lib/customPrintDisplayPrice';

export async function PUT(req) {
    try {
        const identity = await cartIdentity(req);
        const { userId } = identity;
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        let { productId, variantId, chosenDeliveryType, selectedVariants } = await req.json();

        productId = sanitizeString(productId);
        variantId = variantId == null ? null : sanitizeString(variantId);
        chosenDeliveryType = sanitizeString(chosenDeliveryType);

        if (!productId || !chosenDeliveryType) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        await connectToDatabase();
        const user = await cartOwner(identity);
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
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

        const isCustomPrint = String(productId || '').startsWith('custom-print:');
        const cartItem = user.cart.find(item => {
            if (item.productId !== productId) return false;
            if (isCustomPrint) return true;
            return (
                // For new variant system, compare selectedVariants
                (selectedVariants && selectedVariantsMatch(item, { selectedVariants })) ||
                // For legacy system, compare variantId
                (!selectedVariants && String(item.variantId || "") === String(variantId || ""))
            );
        });

        if (!cartItem) {
            return NextResponse.json({ error: "Cart item not found" }, { status: 404 });
        }

        // Validate chosenDeliveryType against the item's REAL configured
        // delivery types before persisting it — an unmatched value must not
        // reach checkout, where it would otherwise silently price at 0 (see
        // lib/quoting/deliveryTypeResolver.js).
        let availableDeliveryTypes = [];
        let product;
        if (isCustomPrint) {
            const requestId = productId.split(':')[1];
            const customPrintRequest = await CustomPrintRequest.findOne({ requestId, userId }).lean();
            availableDeliveryTypes = customPrintRequest?.delivery?.deliveryTypes || [];
        } else {
            product = await Product.findById(productId).lean();
            availableDeliveryTypes = product?.delivery?.deliveryTypes || [];
        }
        const deliveryResolution = resolveDeliveryFee(availableDeliveryTypes, chosenDeliveryType, { key: 'type' });
        if (!deliveryResolution.ok) {
            return NextResponse.json({ error: "Unknown delivery type" }, { status: 400 });
        }

        let cartBreakdown;
        if (chosenDeliveryType === 'standard-shipping') {
            const shippingLines = [];
            const extraDiscountRules = await checkoutDiscountRules();
            for (const line of user.cart) {
                const type = line === cartItem ? chosenDeliveryType : line.chosenDeliveryType;
                const customRequest = String(line.productId).startsWith('custom-print:');
                if (customRequest) {
                    const requestId = line.customPrintRequestId || line.requestId || line.productId.split(':')[1];
                    const request = await CustomPrintRequest.findOne({ requestId, userId }).lean();
                    const fixed = ['quoted', 'payment_pending', 'paid', 'printing', 'printed', 'shipped', 'delivered'].includes(request?.status);
                    const charge = fixed ? customPrintChargeBreakdown(request, type) : { amount: 0, deliveryFee: 0, currency: 'SGD', chosenDeliveryType: type };
                    shippingLines.push({ product: {}, customRequest: true, breakdown: {
                        productId: line.productId, quantity: 1, price: charge.amount, currency: charge.currency,
                        chosenDeliveryType: charge.chosenDeliveryType, deliveryFee: charge.deliveryFee,
                    } });
                } else {
                    const lineProduct = line.productId === productId ? product : await Product.findById(line.productId).lean();
                    if (!lineProduct) return NextResponse.json({ error: 'An item is no longer available.' }, { status: 409 });
                    const breakdown = await calculateCartItemBreakdown({
                        item: { quantity: line.quantity, selectedVariants: line.selectedVariants, chosenDeliveryType: type },
                        product: lineProduct, extraDiscountRules,
                    });
                    shippingLines.push({ product: lineProduct, breakdown });
                }
            }
            // Reprice the proposed whole cart BEFORE saving. Browser amounts
            // are ignored; the same discounted subtotal drives cart and Stripe.
            applyShopShipping(shippingLines);
            cartBreakdown = shippingLines.map(line => line.breakdown);
            if (cartBreakdown.some(line => line.shippingBlocked)) {
                return NextResponse.json({ error: DELIVERY_QUOTE_MESSAGE, code: 'shipping_quote_required' }, { status: 409 });
            }
        }

        cartItem.chosenDeliveryType = chosenDeliveryType;
        await user.save();

        return NextResponse.json({ success: true, cart: user.cart, ...(cartBreakdown && { cartBreakdown }) }, { status: 200 });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
