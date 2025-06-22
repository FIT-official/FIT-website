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
        const existingIndex = user.cart.findIndex(
            item =>
                item.productId === cartItem.productId &&
                item.variantId === (cartItem.variantId || null) &&
                item.chosenDeliveryType === cartItem.chosenDeliveryType
        );

        if (existingIndex !== -1) {
            user.cart[existingIndex].quantity += cartItem.quantity || 1;
        } else {
            user.cart.push({
                productId: cartItem.productId,
                quantity: cartItem.quantity || 1,
                variantId: cartItem.variantId || null,
                chosenDeliveryType: cartItem.chosenDeliveryType,
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
        const { productId, variantId } = await req.json();
        if (!productId) {
            return NextResponse.json({ error: "Missing product" }, { status: 400 });
        }
        const user = await User.findOne({ userId });
        user.cart = user.cart.filter(
            item =>
                !(item.productId === productId && (item.variantId || null) === (variantId || null))
        );
        await user.save();
        return NextResponse.json({ success: true, cart: user.cart }, { status: 200 });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}