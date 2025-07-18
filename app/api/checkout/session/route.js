import { NextResponse } from "next/server";
import Stripe from "stripe";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
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
    const { userId } = await auth();
    if (!userId)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectToDatabase();

    const user = await User.findOne({ userId });
    const client = await clerkClient();
    const userObj = await client.users.getUser(userId);
    const stripeCustomerId = userObj.publicMetadata?.stripeCustomerId;
    const email = userObj.emailAddresses?.[0]?.emailAddress;

    if (!user)
        return NextResponse.json({ error: "Cart not found" }, { status: 404 });

    const address = user.contact?.address;
    if (!address || !address.country) {
        return NextResponse.json({ error: "Missing delivery address" }, { status: 400 });
    }

    const domain = process.env.NEXT_PUBLIC_BASE_URL;

    const line_items = [];
    const updatedCart = [];

    for (const item of user.cart) {
        try {
            const { product } = await fetchProductDetails(item.productId);

            const breakdown = await calculateCartItemBreakdown({
                item,
                product,
                address,
            });
            const { price, deliveryFee, quantity, chosenDeliveryType } = breakdown;

            const unit_amount = Math.round(price * 100);

            line_items.push({
                price_data: {
                    currency: "sgd",
                    product_data: {
                        name: product.name || "Unknown Product",
                        images: [product.images?.[0] || ""],
                    },
                    unit_amount,
                },
                quantity,
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
                    quantity: 1,
                });
            }

            updatedCart.push({
                ...item.toObject?.() || { ...item },
                price: price + deliveryFee,
                basePrice: price,
                deliveryFee,
            });
        } catch (error) {
            console.error(
                `Error fetching product details for ${item.productId}:`,
                error
            );
            const errorMessage = error.message || "An unknown error occurred";
            return NextResponse.json({ error: errorMessage }, { status: 500 });
        }
    }

    user.cart.forEach((item, idx) => {
        if (updatedCart[idx]) {
            item.price = updatedCart[idx].price;
            item.basePrice = updatedCart[idx].basePrice;
            item.deliveryFee = updatedCart[idx].deliveryFee;
        }
    });
    await user.save();

    const allFree = line_items.length > 0 && line_items.every(
        li => li.price_data.unit_amount === 0
    );

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
        };

        if (stripeCustomerId) {
            sessionParams.customer = stripeCustomerId;
        } else if (email) {
            sessionParams.customer_email = email;
        }

        const session = await stripe.checkout.sessions.create(sessionParams);

        if (!session.client_secret) {
            throw new Error("Failed to create a valid Stripe session.");
        }

        return NextResponse.json({ clientSecret: session.client_secret });
    } catch (error) {
        console.error("Error creating Stripe session:", error);
        return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
    }
}
