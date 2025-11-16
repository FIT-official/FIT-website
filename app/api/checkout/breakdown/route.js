import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { calculateCartItemBreakdown } from "../calculateBreakdown";
import { authenticate } from "@/lib/authenticate";

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

        const cartBreakdown = [];
        for (const item of user.cart) {
            const product = await fetchProduct(item.productId);
            try {
                const breakdown = await calculateCartItemBreakdown({
                    item,
                    product,
                    address,
                });
                // Add order note to the breakdown
                breakdown.orderNote = item.orderNote || "";
                cartBreakdown.push(breakdown);
            } catch (err) {
                console.error("Error in cart breakdown:", err);
            }
        }

        return NextResponse.json({ cartBreakdown }, { status: 200 });
    } catch (err) {
        console.error("Server error in /api/checkout/breakdown:", err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}