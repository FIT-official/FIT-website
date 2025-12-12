import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import Product from '@/models/Product'

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url)
        const idsParam = searchParams.get('ids')

        if (!idsParam) {
            return NextResponse.json({ error: 'Product IDs are required' }, { status: 400 })
        }

        const productIds = idsParam.split(',').filter(id => id.trim())

        if (productIds.length === 0) {
            return NextResponse.json({ products: [] }, { status: 200 })
        }

        // Limit to 50 products per request
        if (productIds.length > 50) {
            return NextResponse.json({ error: 'Maximum 50 products per request' }, { status: 400 })
        }

        await connectToDatabase()

        // Fetch all products in one query
        const products = await Product.find({
            _id: { $in: productIds }
        }).select('_id name variants').lean()

        // Create a map for quick lookup
        const productMap = {}
        products.forEach(product => {
            productMap[product._id.toString()] = product
        })

        // Return products in the same order as requested
        const orderedProducts = productIds.map(id => productMap[id] || null).filter(p => p !== null)

        return NextResponse.json({ products: orderedProducts }, { status: 200 })
    } catch (error) {
        console.error('Error fetching batch products:', error)
        return NextResponse.json(
            { error: 'Failed to fetch products' },
            { status: 500 }
        )
    }
}
