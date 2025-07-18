import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { auth } from "@clerk/nextjs/server";
import { calculateCartItemBreakdown } from "../calculateBreakdown";

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
        const address = user.contact?.address;
        if (!address || !address.country) {
            console.error("Missing delivery address for user:", userId);
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