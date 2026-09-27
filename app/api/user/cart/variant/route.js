import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { cartIdentity, cartOwner } from "@/lib/cartOwner";
import { sanitizeString } from "@/utils/validate";

export async function PUT(req) {
    try {
        const identity = await cartIdentity(req);
        const { userId } = identity;
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        let { productId, oldVariantId, newVariantId, chosenDeliveryType } = await req.json();

        productId = sanitizeString(productId);
        oldVariantId = oldVariantId == null ? null : sanitizeString(oldVariantId);
        newVariantId = newVariantId == null ? null : sanitizeString(newVariantId);
        chosenDeliveryType = sanitizeString(chosenDeliveryType);

        if (!productId || !newVariantId || !chosenDeliveryType) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        await connectToDatabase();
        const user = await cartOwner(identity);
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Find the cart item to update
        const cartItem = user.cart.find(
            item =>
                item.productId === productId &&
                String(item.variantId || "") === String(oldVariantId || "") &&
                item.chosenDeliveryType === chosenDeliveryType
        );

        if (!cartItem) {
            return NextResponse.json({ error: "Cart item not found" }, { status: 404 });
        }

        cartItem.variantId = newVariantId;
        await user.save();

        return NextResponse.json({ success: true, cart: user.cart }, { status: 200 });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}