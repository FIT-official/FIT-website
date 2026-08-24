import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import Event from "@/models/Event";
import CustomPrintRequest from "@/models/CustomPrintRequest";
import { calculateCartItemBreakdown } from "../calculateBreakdown";
import { customPrintChargeBreakdown } from "@/lib/customPrintDisplayPrice";
import { authenticate, UnauthorizedError, unauthorizedResponse } from "@/lib/authenticate";

async function fetchProduct(productId) {
    try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/product?productId=${productId}`);
        const data = await res.json();
        return data.product;
    } catch (err) {
        console.error(`Error fetching product ${productId}:`, err);
        return null;
    }
}

export async function GET(req) {
    try {
        const { userId } = await authenticate(req);
        await connectToDatabase();
        const user = await User.findOne({ userId });
        const address = user.contact?.address;
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

            if (!product) continue;

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
            }
        }

        return NextResponse.json({ cartBreakdown }, { status: 200 });
    } catch (err) {
        if (err instanceof UnauthorizedError) return unauthorizedResponse();
        console.error("Server error in /api/checkout/breakdown:", err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}