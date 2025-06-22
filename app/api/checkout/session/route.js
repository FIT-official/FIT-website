import { NextResponse } from "next/server";
import Stripe from "stripe";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { calculateSingpostRate, getDestinationZone } from "../singpostRate";

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

    if (!user)
        return NextResponse.json({ error: "Cart not found" }, { status: 404 });

    const address = user.contact?.address;
    if (!address || !address.country) {
        return NextResponse.json({ error: "Missing delivery address" }, { status: 400 });
    }
    const destination = getDestinationZone(address.country);
    const domain = process.env.NGROK_URL || process.env.NEXT_PUBLIC_BASE_URL;

    const line_items = [];
    for (const item of user.cart) {
        try {
            const productResponse = await fetchProductDetails(item.productId);
            const product = productResponse.product;
            const price = product.price?.presentmentAmount;
            if (!price || isNaN(price)) {
                throw new Error(
                    `Invalid price for product ${item.productId}: ${price}`
                );
            }

            const deliveryTypeObj = (product.delivery?.deliveryTypes || []).find(
                dt => dt.type === item.chosenDeliveryType
            );
            const royaltyFee = deliveryTypeObj?.royaltyFee || 0;

            let deliveryFee = royaltyFee;
            if (item.chosenDeliveryType === "singpost") {
                const weight_kg = product.dimensions?.weight || 0;
                const dimensions_mm = [
                    (product.dimensions?.length || 0) * 10,
                    (product.dimensions?.width || 0) * 10,
                    (product.dimensions?.height || 0) * 10,
                ];
                const singpostFee = calculateSingpostRate(destination, weight_kg, dimensions_mm);
                if (singpostFee < 0) {
                    throw new Error("Unable to calculate SingPost fee for this item.");
                }
                deliveryFee += singpostFee;
            }

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
                quantity: item.quantity,
            });

            if (deliveryFee > 0) {
                line_items.push({
                    price_data: {
                        currency: "sgd",
                        product_data: {
                            name: `Delivery (${item.chosenDeliveryType}) for ${product.name}`,
                        },
                        unit_amount: Math.round(deliveryFee * 100),
                    },
                    quantity: 1,
                });
            }
        } catch (error) {
            console.error(
                `Error fetching product details for ${item.productId}:`,
                error
            );
            const errorMessage =
                error && typeof error === "object" && "message" in error
                    ? error.message
                    : "An unknown error occurred";
            return NextResponse.json({ error: errorMessage }, { status: 500 });
        }
    }

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card", "paynow"],
            line_items,
            mode: "payment",
            ui_mode: "custom",
            return_url: `${domain}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
            customer: stripeCustomerId,
        });

        if (!session.client_secret) {
            throw new Error("Failed to create a valid Stripe session.");
        }

        return NextResponse.json({ clientSecret: session.client_secret });
    } catch (error) {
        console.error("Error creating Stripe session:", error);
        return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
    }
}
