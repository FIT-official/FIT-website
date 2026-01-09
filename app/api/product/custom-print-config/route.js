import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import Product from '@/models/Product'
import User from '@/models/User'
import { authenticate } from '@/lib/authenticate'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'

export async function GET(req) {
    try {
        const { userId } = await authenticate(req);

        await connectToDatabase()
        let product = await Product.findOne({ slug: 'custom-print-request' })

        return NextResponse.json({ product })
    } catch (error) {
        console.error('Error fetching custom print product:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function POST(request) {
    try {
        const { userId } = await authenticate(request);
        await checkAdminPrivileges(userId);

        await connectToDatabase()

        const { name, description, images, basePrice, priceCredits, delivery, dimensions, discount } = await request.json()

        // Find or create the custom print product by slug
        let product = await Product.findOne({ slug: 'custom-print-request' })

        if (product) {
            // Update existing product
            if (name) product.name = name
            if (description !== undefined) product.description = description
            if (images) product.images = images
            product.basePrice = basePrice
            product.priceCredits = priceCredits || 0
            product.delivery = delivery
            product.dimensions = dimensions
            product.discount = discount
            await product.save()
        } else {
            // Create new product (MongoDB will auto-generate _id)
            product = new Product({
                creatorUserId: userId,
                name: name || 'Custom 3D Print',
                description: description || 'Custom 3D printing service - upload your model and configure print settings',
                images: images || [],
                basePrice: basePrice,
                priceCredits: priceCredits || 0,
                productType: 'print',
                delivery: delivery,
                dimensions: dimensions,
                discount: discount,
                slug: 'custom-print-request',
                hidden: true, // Hidden from shop listings
                schemaVersion: 3
            })
            await product.save()
        }

        return NextResponse.json({ success: true, product })
    } catch (error) {
        console.error('Error saving custom print product:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
