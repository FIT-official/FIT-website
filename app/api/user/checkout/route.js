import { connectToDatabase } from "@/lib/db";
import Product from "@/models/Product";
import User from "@/models/User";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function POST(req) {
    try {
        const { userId } = await auth();
        if (!userId)
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        await connectToDatabase();
        const user = await User.findOne({ userId });
        if (!user)
            return NextResponse.json({ error: "User data not found" }, { status: 404 });

        const orders = user.cart.map(item => ({
            cartItem: {
                productId: item.productId,
                quantity: item.quantity,
                variantId: item.variantId,
                chosenDeliveryType: item.chosenDeliveryType,
            },
            status: "pending",
        }));

        for (const item of user.cart) {
            const product = await Product.findById(item.productId);
            if (product) {
                product.sales.push({
                    userId,
                    quantity: item.quantity,
                    price: item.price || 0,
                });
                await product.save();
            }
        }

        user.orderHistory.push(...orders);
        user.cart = [];
        await user.save();

        return NextResponse.json({ message: "Checkout successful" }, { status: 200 });
    } catch (error) {
        console.error("Error during checkout:", error);
        return NextResponse.json({ error: "Failed to process checkout" }, { status: 500 });
    }
}
