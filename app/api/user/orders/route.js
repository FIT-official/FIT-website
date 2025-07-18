import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { auth } from "@clerk/nextjs/server";

export async function POST(req) {
    try {
        await connectToDatabase();
        const { productIds } = await req.json();
        if (!Array.isArray(productIds) || productIds.length === 0) {
            return NextResponse.json([], { status: 200 });
        }
        const users = await User.find(
            { "orderHistory.cartItem.productId": { $in: productIds } },
            { userId: 1, orderHistory: 1, firstName: 1, emailAddresses: 1, _id: 0 }
        );
        return NextResponse.json(users);
    } catch (error) {
        console.error("Error fetching filtered users' orders:", error);
        return NextResponse.json({ error: "Failed to fetch users' orders" }, { status: 500 });
    }
}

export async function GET(req) {
    try {

        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        await connectToDatabase();
        const user = await User.findOne({ userId }, { orderHistory: 1, _id: 0 });
        return NextResponse.json({ orders: user.orderHistory || [] }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
    }
}