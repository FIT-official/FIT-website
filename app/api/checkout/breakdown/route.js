import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { cartIdentity, cartOwner } from "@/lib/cartOwner";
import { checkoutDiscountRules } from '@/lib/checkoutDiscounts';
import { applyShopShipping } from '@/lib/shopShipping';
import Product from "@/models/Product";
import CustomPrintRequest from "@/models/CustomPrintRequest";
import { calculateCartItemBreakdown } from "../calculateBreakdown";
import { customPrintChargeBreakdown } from "@/lib/customPrintDisplayPrice";
import { isAddressComplete, lineNeedsDeliveryAddress, pickAddressFields } from "@/lib/checkoutAddressGate";

const FIXED_PRICE_STATUSES = [
    'quoted',
    'payment_pending',
    'paid',
    'printing',
    'printed',
    'shipped',
    'delivered',
];

async function fetchProduct(productId) {
    return Product.findById(productId).select('-shippingCosts').lean();
}

export async function GET(req) {
    try {
        const identity = await cartIdentity(req);
        const { userId } = identity;
        if (!userId) return NextResponse.json({ error: 'Open your cart before continuing.' }, { status: 401 });
        await connectToDatabase();
        const user = await cartOwner(identity);
        const address = (identity.guest ? user?.guestContact?.address : user?.contact?.address) || null;
        const addressMissing = !isAddressComplete(address);

        // Load active global events once for this checkout breakdown
        const extraDiscountRules = await checkoutDiscountRules();

        // The custom-print base product is read straight from the database.
        // The previous server-to-server fetch of /api/product/custom-print-config
        // carried no session cookie, got a 401, and every custom-print line was
        // silently dropped from the breakdown.
        let customPrintProduct;
        const getCustomPrintProduct = async () => {
            if (customPrintProduct === undefined) {
                customPrintProduct = await Product.findOne({ slug: 'custom-print-request' }).lean();
            }
            return customPrintProduct;
        };

        const cartBreakdown = [];
        const shippingLines = [];
        for (const item of user?.cart || []) {
            let product = null;
            let customPrintRequest = null;
            const isCustomPrintItem = String(item.productId || '').startsWith('custom-print:');

            if (isCustomPrintItem) {
                const requestId = item.customPrintRequestId || item.requestId || (item.productId || '').split(':')[1];
                customPrintRequest = await CustomPrintRequest.findOne({ requestId, userId });
                product = await getCustomPrintProduct();
            } else {
                product = await fetchProduct(item.productId);
            }

            if (!product) return NextResponse.json({ error: "An item is no longer available. Remove it from your cart to continue." }, { status: 409 });

            try {
                let breakdown;
                const isFixedPricedCustomPrint = customPrintRequest && FIXED_PRICE_STATUSES.includes(customPrintRequest.status);

                if (isFixedPricedCustomPrint) {
                    // Quoted pricing: instant quotes charge quote.total, manual
                    // quotes charge basePrice + printFee — always the same amount
                    // the cart displays (customPrintDisplayPrice).
                    let charge;
                    let deliveryTypeMismatch = false;
                    try {
                        charge = customPrintChargeBreakdown(customPrintRequest, item.chosenDeliveryType || '');
                    } catch (err) {
                        // The cart holds a delivery type the request no longer
                        // offers. Price with the request's default and flag it
                        // rather than dropping the line from the summary.
                        deliveryTypeMismatch = true;
                        charge = customPrintChargeBreakdown(customPrintRequest, '');
                    }

                    breakdown = {
                        productId: item.productId,
                        selectedVariants: item.selectedVariants || {},
                        name: product.name,
                        quantity: 1,
                        price: charge.amount,
                        priceBeforeDiscount: charge.amount,
                        basePrice: Number(customPrintRequest.basePrice || 0),
                        variantInfo: [],
                        chosenDeliveryType: charge.chosenDeliveryType,
                        deliveryFee: charge.deliveryFee,
                        total: charge.total,
                        creatorUserId: product.creatorUserId,
                        currency: charge.currency,
                        customPrintRequestId: customPrintRequest.requestId,
                        customPrintStatus: customPrintRequest.status,
                        ...(deliveryTypeMismatch
                            ? {
                                deliveryTypeMismatch: true,
                                warning: `The delivery option "${item.chosenDeliveryType}" is no longer offered for this print. Priced with "${charge.chosenDeliveryType}" instead; pick a delivery option to confirm.`,
                            }
                            : {}),
                    };
                } else if (isCustomPrintItem) {
                    // Custom print not yet quoted — model missing/deleted, awaiting
                    // upload, config, or a manual admin quote. There is no charge
                    // yet, so price/delivery are 0 (no stale snapshot leaks through).
                    const requestId = item.customPrintRequestId || item.requestId || (item.productId || '').split(':')[1];
                    breakdown = {
                        productId: item.productId,
                        selectedVariants: item.selectedVariants || {},
                        name: product.name,
                        quantity: 1,
                        price: 0,
                        priceBeforeDiscount: 0,
                        basePrice: 0,
                        variantInfo: [],
                        chosenDeliveryType: item.chosenDeliveryType || '',
                        deliveryFee: 0,
                        total: 0,
                        creatorUserId: product.creatorUserId,
                        currency: 'SGD',
                        customPrintRequestId: requestId,
                        customPrintStatus: customPrintRequest?.status || 'pending'
                    };
                } else {
                    // Normal product breakdown
                    breakdown = await calculateCartItemBreakdown({
                        item,
                        product,
                        address,
                        extraDiscountRules,
                    });
                }
                // Add order note to the breakdown
                breakdown.orderNote = item.orderNote || "";
                breakdown.needsDeliveryAddress = lineNeedsDeliveryAddress(breakdown.chosenDeliveryType);
                cartBreakdown.push(breakdown);
                shippingLines.push({ product, breakdown, customRequest: isCustomPrintItem });
            } catch (err) {
                console.error("Error in cart breakdown:", err);
                return NextResponse.json({ error: "Unable to calculate this cart. Check delivery options and try again." }, { status: 503 });
            }
        }

        applyShopShipping(shippingLines, address);
        const needsDeliveryAddress = cartBreakdown.some(line => line.needsDeliveryAddress);

        // The raw (possibly partial) address is returned so the inline form
        // can prefill what the customer already saved.
        return NextResponse.json({
            cartBreakdown,
            shippingBlocked: cartBreakdown.some(line => line.shippingBlocked),
            addressMissing,
            needsDeliveryAddress,
            address: address ? pickAddressFields(address) : null,
        }, { status: 200 });
    } catch (err) {
        console.error("Server error in /api/checkout/breakdown:", err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
