import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { calculateSingpostRate, getDestinationZone } from "../singpostRate";
import { auth } from "@clerk/nextjs/server";

// Helper to fetch product details
async function fetchProduct(productId) {
    try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/product?productId=${productId}`);
        if (!res.ok) throw new Error("Failed to fetch product");
        const data = await res.json();
        return data.product;
    } catch (err) {
        console.error(`Error fetching product ${productId}:`, err);
        return null;
    }
}

export async function GET(req) {
    try {
        const { userId } = await auth();
        if (!userId) {
            console.error("Unauthorized: No userId from auth()");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();
        const user = await User.findOne({ userId });
        if (!user) {
            console.error(`User not found for userId: ${userId}`);
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const address = user.contact?.address;
        if (!address || !address.country) {
            console.error("Missing delivery address for user:", userId);
            return NextResponse.json({ error: "Missing delivery address" }, { status: 400 });
        }
        const destination = getDestinationZone(address.country);

        const cartBreakdown = [];
        for (const item of user.cart) {
            let product;
            try {
                product = await fetchProduct(item.productId);
            } catch (err) {
                console.error(`Error in fetchProduct for productId ${item.productId}:`, err);
                continue;
            }
            if (!product) {
                console.error(`Product not found for productId: ${item.productId}`);
                continue;
            }

            const price = product.price?.presentmentAmount || 0;
            const quantity = item.quantity || 1;

            // Find chosen delivery type
            const deliveryTypeObj = (product.delivery?.deliveryTypes || []).find(
                dt => dt.type === item.chosenDeliveryType
            );
            const royaltyFee = deliveryTypeObj?.royaltyFee || 0;

            let deliveryFee = royaltyFee;
            let singpostFee = 0;
            if (item.chosenDeliveryType === "singpost") {
                try {
                    const weight_kg = product.dimensions?.weight || 0;
                    const dimensions_mm = [
                        (product.dimensions?.length || 0) * 10,
                        (product.dimensions?.width || 0) * 10,
                        (product.dimensions?.height || 0) * 10,
                    ];
                    singpostFee = calculateSingpostRate(destination, weight_kg, dimensions_mm);
                    if (singpostFee < 0) singpostFee = 0;
                    deliveryFee += singpostFee;
                } catch (err) {
                    console.error(`Error calculating SingPost fee for productId ${item.productId}:`, err);
                }
            }

            const total = (price * quantity) + deliveryFee;

            cartBreakdown.push({
                name: product.name,
                quantity,
                price,
                chosenDeliveryType: item.chosenDeliveryType,
                royaltyFee,
                singpostFee,
                deliveryFee,
                total,
            });
        }

        return NextResponse.json({ cartBreakdown }, { status: 200 });
    } catch (err) {
        console.error("Server error in /api/checkout/breakdown:", err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}