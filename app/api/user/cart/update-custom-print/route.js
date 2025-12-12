import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { connectToDatabase } from "@/lib/db"
import User from "@/models/User"

export async function PUT(req) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        await connectToDatabase()
        const { productId, requestId } = await req.json()

        if (productId !== 'custom-print-request' || !requestId) {
            return NextResponse.json({ error: "Invalid request" }, { status: 400 })
        }

        const user = await User.findOne({ userId })
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 })
        }

        console.log('User cart before update:', JSON.stringify(user.cart, null, 2))

        // Find the custom print request in cart and update it with requestId
        const cartItemIndex = user.cart.findIndex(item => item.productId === 'custom-print-request')

        if (cartItemIndex === -1) {
            return NextResponse.json({ error: "Custom print request not found in cart" }, { status: 404 })
        }

        // Update the cart item with the requestId - use set() to ensure Mongoose tracks the change
        user.cart[cartItemIndex].set('requestId', requestId)
        user.markModified('cart')

        console.log('Updated cart item:', JSON.stringify(user.cart[cartItemIndex].toObject(), null, 2))

        await user.save()

        console.log('User cart after save:', JSON.stringify(user.cart.map(item => item.toObject()), null, 2))

        return NextResponse.json({ success: true, cart: user.cart }, { status: 200 })
    } catch (error) {
        console.error("Error updating custom print request:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
