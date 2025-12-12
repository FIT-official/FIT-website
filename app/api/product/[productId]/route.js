import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import Product from '@/models/Product'

export async function GET(request, { params }) {
    try {
        await connectToDatabase()

        const { productId } = await params

        // Return the full product document so downstream consumers
        // (e.g. ProductCard, CreatorPayments, FeaturedSection) have
        // access to images, pricing, reviews, sales, etc.
        const product = await Product.findById(productId).lean()

        if (!product) {
            return NextResponse.json({ error: 'Product not found' }, { status: 404 })
        }

        return NextResponse.json(product)
    } catch (error) {
        console.error('Error fetching product:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}