import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/db";
import Order from "@/models/Order";
import { checkAdminPrivileges } from "@/lib/checkPrivileges";

export const dynamic = 'force-dynamic';

// GET - Fetch orders for a user, optionally filtered by product
export async function GET(req) {
    try {
        const { userId: clerkUserId } = await auth();
        if (!clerkUserId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const requestedUserId = searchParams.get("userId");
        const productId = searchParams.get("productId");
        const orderId = searchParams.get("orderId");

        await connectToDatabase();

        // Check if user is admin based on Clerk metadata
        const isAdmin = await checkAdminPrivileges(clerkUserId);

        // Only allow users to fetch their own orders unless they're admin
        if (requestedUserId !== clerkUserId && !isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Build query
        let query = {};

        if (orderId) {
            // Fetch specific order
            query.orderId = orderId;
        } else {
            // Fetch orders for user
            query.userId = requestedUserId || clerkUserId;
        }

        // Fetch orders
        let orders = await Order.find(query).sort({ createdAt: -1 });

        // Filter by product if specified
        if (productId) {
            orders = orders.filter(order =>
                order.items.some(item => item.productId.toString() === productId)
            );
        }

        return NextResponse.json({ orders }, { status: 200 });

    } catch (error) {
        console.error("Error fetching orders:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
