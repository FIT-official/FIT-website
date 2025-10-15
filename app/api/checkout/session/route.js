import { NextResponse } from "next/server";
import Stripe from "stripe";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import CheckoutSession from "@/models/CheckoutSession";
import { calculateCartItemBreakdown } from "../calculateBreakdown";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-05-28.basil",
});

async function fetchProductDetails(productId) {
    const res = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_URL}/api/product?productId=${productId}`
    );
    if (!res.ok)
        throw new Error(`Failed to fetch product details for ID: ${productId}`);
    return res.json();
}

export async function POST(req) {
    try {
        // console.log("POST /api/checkout/session called");
        const { userId } = await auth();
        // console.log("Auth result:", userId);
        if (!userId) {
            console.error("Auth error: No userId found");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();
        // console.log("Connected to database");

        const user = await User.findOne({ userId });
        const client = await clerkClient();
        const userObj = await client.users.getUser(userId);
        // console.log("Fetched Clerk user:", userObj);
        const stripeCustomerId = userObj.publicMetadata?.stripeCustomerId;
        const email = userObj.emailAddresses?.[0]?.emailAddress;

        if (!user) {
            console.error("User error: Cart not found for userId", userId);
            return NextResponse.json({ error: "Cart not found" }, { status: 404 });
        }

        const address = user.contact?.address;
        //console.log("User address:", address);
        if (!address || !address.country) {
            console.error("Address error: Missing delivery address for userId", userId);
            return NextResponse.json({ error: "Missing delivery address" }, { status: 400 });
        }

        const domain = process.env.NEXT_PUBLIC_BASE_URL;
        //console.log("Domain:", domain);

        const line_items = [];
        const updatedCart = [];
        const salesData = {};
        const digitalProductData = {};
        let totalSessionAmount = 0;

        for (const item of user.cart) {
            try {
                // console.log("Processing cart item:", item);
                const { product } = await fetchProductDetails(item.productId);
                // console.log("Fetched product details:", product);

                // Use calculateCartItemBreakdown for all pricing calculations
                const breakdown = await calculateCartItemBreakdown({
                    item,
                    product,
                    address,
                });
                // console.log("Breakdown:", breakdown);

                const { price, deliveryFee, quantity, chosenDeliveryType, basePrice, priceBeforeDiscount, variantInfo, currency } = breakdown;
                const unit_amount = Math.round(price * 100);

                // Add to digitalProductData if product has paid assets (for both digital and print delivery)
                if (product.paidAssets && product.paidAssets.length > 0) {
                    digitalProductData[item.productId] = {
                        buyer: userId,
                        links: Array.isArray(product.paidAssets) ? product.paidAssets : [],
                    };
                }

                // Build product name with variant info if available
                let productName = product.name || "Unknown Product";
                if (variantInfo && variantInfo.length > 0) {
                    const variantText = variantInfo.map(v => `${v.option}`).join(", ");
                    productName = `${productName} (${variantText})`;
                }

                line_items.push({
                    price_data: {
                        currency: "sgd",
                        product_data: {
                            name: productName,
                            images: [product.images?.[0] || ""],
                        },
                        unit_amount,
                    },
                    quantity: chosenDeliveryType === "digital" ? 1 : quantity,
                });

                if (deliveryFee > 0) {
                    line_items.push({
                        price_data: {
                            currency: "sgd",
                            product_data: {
                                name: `Delivery (${chosenDeliveryType}) for ${product.name}`,
                            },
                            unit_amount: Math.round(deliveryFee * 100),
                        },
                        quantity: chosenDeliveryType === "digital" ? 1 : quantity,
                    });
                }

                // Store complete pricing breakdown in cart for order history
                updatedCart.push({
                    ...item.toObject?.() || { ...item },
                    price: price + deliveryFee, // Total price paid
                    finalPrice: price, // Price after discount, before delivery
                    basePrice: basePrice, // Base price without variants/options
                    priceBeforeDiscount: priceBeforeDiscount, // Base + variants before discount
                    variantInfo: variantInfo || [], // Array of variant selections with fees
                    deliveryFee,
                    currency: currency || 'SGD',
                });

                const productRevenue = price * quantity * 100; // Product revenue in cents
                const shippingRevenue = deliveryFee * quantity * 100; // Shipping revenue in cents
                const totalForThisItem = productRevenue + shippingRevenue;

                if (!salesData[product.creatorUserId]) {
                    salesData[product.creatorUserId] = {
                        totalAmount: 0,
                        productRevenue: 0,
                        shippingRevenue: 0,
                        items: []
                    };
                }

                salesData[product.creatorUserId].totalAmount += totalForThisItem;
                salesData[product.creatorUserId].productRevenue += productRevenue;
                salesData[product.creatorUserId].shippingRevenue += shippingRevenue;
                salesData[product.creatorUserId].items.push({
                    productId: item.productId,
                    selectedVariants: item.selectedVariants || {},
                    variantInfo: variantInfo || [],
                    quantity: quantity,
                    unitPrice: price,
                    deliveryFee: deliveryFee,
                    deliveryType: chosenDeliveryType
                });

                totalSessionAmount += totalForThisItem;
            } catch (error) {
                console.error(
                    `Error fetching product details or calculating breakdown for productId ${item.productId}:`,
                    error
                );
                const errorMessage = error.message || "An unknown error occurred";
                return NextResponse.json({ error: errorMessage }, { status: 500 });
            }
        }

        user.cart.forEach((item, idx) => {
            if (updatedCart[idx]) {
                item.price = updatedCart[idx].price;
                item.finalPrice = updatedCart[idx].finalPrice;
                item.basePrice = updatedCart[idx].basePrice;
                item.priceBeforeDiscount = updatedCart[idx].priceBeforeDiscount;
                item.variantInfo = updatedCart[idx].variantInfo;
                item.deliveryFee = updatedCart[idx].deliveryFee;
                item.currency = updatedCart[idx].currency;
            }
        });

        await user.save();
        // console.log("User cart saved");

        const allFree = line_items.length > 0 && line_items.every(
            li => li.price_data.unit_amount === 0
        );
        // console.log("All free:", allFree);

        if (allFree) {
            return NextResponse.json({ clientSecret: null, free: true });
        }

        try {
            const sessionParams = {
                payment_method_types: ["card", "paynow"],
                line_items,
                mode: "payment",
                ui_mode: "custom",
                return_url: `${domain}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
                metadata: {
                    userId: userId, // Only store minimal data in Stripe metadata
                },
            };
            // console.log("Stripe sessionParams:", sessionParams);

            if (stripeCustomerId) {
                sessionParams.customer = stripeCustomerId;
            } else if (email) {
                sessionParams.customer_email = email;
            }

            const session = await stripe.checkout.sessions.create(sessionParams);
            // console.log("Stripe session created:", session);

            // Store detailed session data in MongoDB
            await CheckoutSession.create({
                sessionId: session.id,
                userId: userId,
                salesData: salesData,
                digitalProductData: digitalProductData,
                totalAmount: totalSessionAmount,
                currency: 'sgd'
            });

            if (!session.client_secret) {
                console.error("Stripe error: No client_secret returned from session", session);
                throw new Error("Failed to create a valid Stripe session.");
            }

            return NextResponse.json({ clientSecret: session.client_secret });
        } catch (error) {
            console.error("Error creating Stripe session:", error);
            return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
        }
    } catch (error) {
        console.error("General error in POST /api/checkout/session:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
