import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { cartIdentity, cartOwner } from "@/lib/cartOwner";
import Product from "@/models/Product";
import CustomPrintRequest from "@/models/CustomPrintRequest";
import { sanitizeString } from "@/utils/validate";
import { resolveDeliveryFee } from "@/lib/quoting/deliveryTypeResolver";
import { usesWeightShipping } from '@/lib/shopShipping';
import { standardShippingTier, DELIVERY_QUOTE_MESSAGE } from '@/lib/shipping/weightTiers';

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

        if (chosenDeliveryType === 'standard-shipping' && usesWeightShipping(product)) {
            const parcel = [];
            for (const line of user.cart) {
                if (String(line.productId).startsWith('custom-print:')) continue;
                if (line !== cartItem && line.chosenDeliveryType !== 'standard-shipping') continue;
                const lineProduct = line.productId === productId ? product : await Product.findById(line.productId).lean();
                if (usesWeightShipping(lineProduct)) parcel.push({ product: lineProduct, quantity: line.quantity });
            }
            // The value threshold changes letterbox vs Speedpost, never whether
            // a parcel is blocked. Recheck the proposed whole standard parcel.
            if (standardShippingTier(parcel, 0).blocked) {
                return NextResponse.json({ error: DELIVERY_QUOTE_MESSAGE, code: 'shipping_quote_required' }, { status: 409 });
            }
        }

        cartItem.chosenDeliveryType = chosenDeliveryType;
        await user.save();

        return NextResponse.json({ success: true, cart: user.cart }, { status: 200 });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
