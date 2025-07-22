import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { auth, clerkClient } from "@clerk/nextjs/server";

export async function POST(req) {
    try {
        await connectToDatabase();
        const { productIds } = await req.json();
        if (!Array.isArray(productIds) || productIds.length === 0) {
            return NextResponse.json([], { status: 200 });
        }
        const users = await User.find(
            { "orderHistory.cartItem.productId": { $in: productIds } },
            { userId: 1, orderHistory: 1, contact: 1, _id: 0 }
        );

        const client = await clerkClient()

        const userInfos = await Promise.all(users.map(async (u) => {
            try {
                const clerkUser = await client.users.getUser(u.userId);
                return {
                    ...u.toObject(),
                    firstName: clerkUser.firstName,
                    emailAddresses: clerkUser.emailAddresses,
                    contact: u.contact,
                };
            } catch (e) {
                return {
                    ...u.toObject(),
                    firstName: null,
                    emailAddresses: [],
                    contact: u.contact,
                };
            }
        }));

        return NextResponse.json(userInfos);
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
        const orders = user?.orderHistory ?? [];
        return NextResponse.json({ orders }, { status: 200 });
    } catch (error) {
        console.error("Error fetching user orders:", error);
        return NextResponse.json({ error: "Failed to fetch orders: " + error.message }, { status: 500 });
    }
}

export async function PUT(req) {
    try {
        await connectToDatabase();
        const { orderId, status } = await req.json();
        if (!orderId || !status) {
            return NextResponse.json({ error: "Missing orderId or status" }, { status: 400 });
        }
        const user = await User.findOne({ "orderHistory._id": orderId });
        if (!user) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        const order = user.orderHistory.id(orderId);
        if (!order) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        order.status = status;
        await user.save();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error("Error updating order status:", error);
        return NextResponse.json({ error: "Failed to update order status" }, { status: 500 });
    }
}