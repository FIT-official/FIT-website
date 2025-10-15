import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { auth } from "@clerk/nextjs/server";

export async function GET(req) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const productId = searchParams.get('productId');
        const variantId = searchParams.get('variantId');

        if (!productId) {
            return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
        }

        await connectToDatabase();

        // Find user and check their order history for digital purchases
        const user = await User.findOne({ userId }, { orderHistory: 1, _id: 0 });

        if (!user || !user.orderHistory) {
            return NextResponse.json({ owns: false }, { status: 200 });
        }

        // Check if user has purchased this product digitally
        const ownsProduct = user.orderHistory.some(order => {
            // Only check successful orders
            if (order.status !== 'completed' && order.status !== 'delivered') {
                return false;
            }

            return order.cartItems.some(item => {
                // Check if this is a digital delivery and matches the product
                const isDigitalDelivery = item.chosenDeliveryType === 'digital';
                const matchesProduct = item.productId === productId;
                const matchesVariant = variantId ? item.variantId === variantId : true;

                return isDigitalDelivery && matchesProduct && matchesVariant;
            });
        });

        return NextResponse.json({ owns: ownsProduct }, { status: 200 });

    } catch (error) {
        console.error("Error checking product ownership:", error);
        return NextResponse.json({ error: "Failed to check product ownership" }, { status: 500 });
    }
}