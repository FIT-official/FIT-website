import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import Product from '@/models/Product'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { productForViewer } from '@/lib/productAccess'

export async function GET(request, { params }) {
    try {
        await connectToDatabase()

        const { productId } = await params

        // Return the full product document so downstream consumers
        // (e.g. ProductCard, CreatorPayments, FeaturedSection) have
        // access to images, pricing, reviews, sales, etc.
        const product = await Product.findById(productId).lean()

        const { userId } = await auth()
        const isAdmin = userId ? (await (await clerkClient()).users.getUser(userId))?.publicMetadata?.role === "admin" : false
        const visible = productForViewer(product, userId, isAdmin)
        if (!visible) {
            return NextResponse.json({ error: 'Product not found' }, { status: 404 })
        }

        return NextResponse.json(visible)
    } catch (error) {
        console.error('Error fetching product:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}