import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { cartIdentity, cartOwner } from "@/lib/cartOwner";
import Event from "@/models/Event";
import Product from "@/models/Product";
import CustomPrintRequest from "@/models/CustomPrintRequest";
import { calculateCartItemBreakdown } from "../calculateBreakdown";
import { customPrintChargeBreakdown } from "@/lib/customPrintDisplayPrice";

async function fetchProduct(productId) {
    return Product.findById(productId).lean();
}

export async function GET(req) {
    try {
        const identity = await cartIdentity(req);
        const { userId } = identity;
        if (!userId) return NextResponse.json({ error: 'Open your cart before continuing.' }, { status: 401 });
        await connectToDatabase();
        const user = await cartOwner(identity);
        if (!user?.cart?.length) return NextResponse.json({ cartBreakdown: [] });
        const address = identity.guest ? user.guestContact?.address || { country: 'SG' } : user.contact?.address;
        if (!address || !address.country) {
            console.error("Missing delivery address for user");
            return NextResponse.json({ error: "Missing delivery address" }, { status: 400 });
        }

        // Load active global events once for this checkout breakdown
        const now = new Date();
        const globalEvents = await Event.find({
            isActive: true,
            isGlobal: true,
            startDate: { $lte: now },
            endDate: { $gte: now },
        }).lean();

        const extraDiscountRules = (globalEvents || []).map(ev => ({
            percentage: ev.percentage,
            minimumAmount: ev.minimumPrice,
            startDate: ev.startDate,
            endDate: ev.endDate,
        }));

        const cartBreakdown = [];
        for (const item of user.cart) {
            let product = null;
            let customPrintRequest = null;

            if (String(item.productId || '').startsWith('custom-print:')) {
                // Handle custom print
                const requestId = item.customPrintRequestId || (item.productId || '').split(':')[1];
                customPrintRequest = await CustomPrintRequest.findOne({ requestId, userId });

                // Fetch custom print base product
                try {
                    const customPrintRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/product/custom-print-config`);
                    if (customPrintRes.ok) {
                        const customPrintData = await customPrintRes.json();
                        product = customPrintData.product;
                    }
                } catch (err) {
                    console.error('Error fetching custom print product:', err);
                }
            } else {
                product = await fetchProduct(item.productId);
            }

            if (!product) return NextResponse.json({ error: "An item is no longer available. Remove it from your cart to continue." }, { status: 409 });

            try {
                let breakdown;
                const isFixedPricedCustomPrint = customPrintRequest && [
                    'quoted',
                    'payment_pending',
                    'paid',
                    'printing',
                    'printed',
                    'shipped',
                    'delivered',
                ].includes(customPrintRequest.status);

                const isCustomPrintItem = String(item.productId || '').startsWith('custom-print:');

                if (isFixedPricedCustomPrint) {
                    // Quoted pricing: instant quotes charge quote.total, manual
                    // quotes charge basePrice + printFee — always the same amount
                    // the cart displays (customPrintDisplayPrice).
                    const charge = customPrintChargeBreakdown(customPrintRequest, item.chosenDeliveryType || '');

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
                        customPrintStatus: customPrintRequest.status
                    };
                } else if (isCustomPrintItem) {
                    // Custom print not yet quoted — model missing/deleted, awaiting
                    // upload, config, or a manual admin quote. There is no charge
                    // yet, so price/delivery are 0 (no stale snapshot leaks through).
                    const requestId = item.customPrintRequestId || (item.productId || '').split(':')[1];
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
                cartBreakdown.push(breakdown);
            } catch (err) {
                console.error("Error in cart breakdown:", err);
                return NextResponse.json({ error: "Unable to calculate this cart. Check delivery options and try again." }, { status: 503 });
            }
        }

        return NextResponse.json({ cartBreakdown }, { status: 200 });
    } catch (err) {
        console.error("Server error in /api/checkout/breakdown:", err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
