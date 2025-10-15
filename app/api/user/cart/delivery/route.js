import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { sanitizeString } from "@/utils/validate";
import { auth } from "@clerk/nextjs/server";

export async function PUT(req) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        let { productId, variantId, chosenDeliveryType, selectedVariants } = await req.json();

        productId = sanitizeString(productId);
        variantId = variantId === undefined ? null : sanitizeString(variantId);
        chosenDeliveryType = sanitizeString(chosenDeliveryType);

        if (!productId || !chosenDeliveryType) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        await connectToDatabase();
        const user = await User.findOne({ userId });
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Helper function to compare selectedVariants Maps
        const selectedVariantsMatch = (item1, item2) => {
            const variants1 = item1.selectedVariants || {};
            const variants2 = item2.selectedVariants || {};
            return JSON.stringify(variants1) === JSON.stringify(variants2);
        };

        const cartItem = user.cart.find(
            item =>
                item.productId === productId &&
                (
                    // For new variant system, compare selectedVariants
                    (selectedVariants && selectedVariantsMatch(item, { selectedVariants })) ||
                    // For legacy system, compare variantId
                    (!selectedVariants && String(item.variantId || "") === String(variantId || ""))
                )
        );

        if (!cartItem) {
            return NextResponse.json({ error: "Cart item not found" }, { status: 404 });
        }

        cartItem.chosenDeliveryType = chosenDeliveryType;
        await user.save();

        return NextResponse.json({ success: true, cart: user.cart }, { status: 200 });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}