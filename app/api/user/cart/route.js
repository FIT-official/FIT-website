import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { auth } from "@clerk/nextjs/server";

export async function POST(req) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();
        const { cartItem } = await req.json();
        if (!cartItem || !cartItem.productId || !cartItem.chosenDeliveryType) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const user = await User.findOne({ userId });

        // Helper function to compare selectedVariants Maps
        const selectedVariantsMatch = (item1, item2) => {
            const variants1 = item1.selectedVariants || {};
            const variants2 = item2.selectedVariants || {};
            return JSON.stringify(variants1) === JSON.stringify(variants2);
        };

        const existingIndex = user.cart.findIndex(
            item =>
                item.productId === cartItem.productId &&
                item.variantId === (cartItem.variantId || null) &&
                item.chosenDeliveryType === cartItem.chosenDeliveryType &&
                selectedVariantsMatch(item, cartItem)
        );

        if (existingIndex !== -1) {
            user.cart[existingIndex].quantity += cartItem.quantity || 1;
        } else {
            user.cart.push({
                productId: cartItem.productId,
                quantity: cartItem.quantity || 1,
                variantId: cartItem.variantId || null,
                selectedVariants: cartItem.selectedVariants || new Map(),
                chosenDeliveryType: cartItem.chosenDeliveryType,
                price: cartItem.price || 0,
                orderNote: cartItem.orderNote || "",
            });
        }

        await user.save();
        return NextResponse.json({ success: true, cart: user.cart }, { status: 200 });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}

export async function GET(req) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        await connectToDatabase();

        const user = await User.findOne({ userId });
        return NextResponse.json({ cart: user.cart }, { status: 200 });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}

export async function DELETE(req) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        await connectToDatabase();
        const { productId, variantId, selectedVariants } = await req.json();
        if (!productId) {
            return NextResponse.json({ error: "Missing product" }, { status: 400 });
        }

        // Helper function to compare selectedVariants Maps
        const selectedVariantsMatch = (item1, item2) => {
            const variants1 = item1.selectedVariants || {};
            const variants2 = item2.selectedVariants || {};
            return JSON.stringify(variants1) === JSON.stringify(variants2);
        };

        const user = await User.findOne({ userId });
        user.cart = user.cart.filter(
            item => {
                // For legacy system compatibility, if no selectedVariants provided, use variantId matching
                if (!selectedVariants && !item.selectedVariants) {
                    return !(item.productId === productId && (item.variantId || null) === (variantId || null));
                }
                // For new variant system, match both productId and selectedVariants
                return !(item.productId === productId && selectedVariantsMatch(item, { selectedVariants: selectedVariants || {} }));
            }
        );
        await user.save();
        return NextResponse.json({ success: true, cart: user.cart }, { status: 200 });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}