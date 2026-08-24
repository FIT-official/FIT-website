import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import Product from '@/models/Product'
import User from '@/models/User'
import { authenticate, unauthorizedResponse, UnauthorizedError } from '@/lib/authenticate'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'
import { validateDimensions } from '@/lib/validation/dimensions'
import { checkMachineLimits, machineLimitMessage } from '@/lib/quoting/machineLimits'
import AppSettings from '@/models/AppSettings'
import { getAppSettingsId } from '@/lib/appSettingsId'

export async function GET(req) {
    try {
        const { userId } = await authenticate(req);

        await connectToDatabase()
        let product = await Product.findOne({ slug: 'custom-print-request' })

        return NextResponse.json({ product })
    } catch (error) {
        if (error instanceof UnauthorizedError) return unauthorizedResponse()
        console.error('Error fetching custom print product:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function POST(request) {
    try {
        const { userId } = await authenticate(request);
        if (!(await checkAdminPrivileges(userId))) {
            return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
        }

        await connectToDatabase()

        const { name, description, images, basePrice, priceCredits, delivery, dimensions, discount } = await request.json()

        const dimCheck = validateDimensions(dimensions)
        if (!dimCheck.ok) {
            return NextResponse.json({ error: dimCheck.error }, { status: 400 })
        }
        const validDimensions = dimCheck.value

        // Range check vs admin-configured machine limits (unit-typo catch;
        // no-op until limits are set in Admin -> Quoting & Pricing).
        if (validDimensions) {
            const appSettings = await AppSettings.findById(getAppSettingsId()).lean()
            const limitsCheck = checkMachineLimits(
                validDimensions,
                validDimensions.weight ?? null,
                appSettings?.machineLimits || null,
            )
            if (!limitsCheck.fits) {
                return NextResponse.json(
                    { error: machineLimitMessage(limitsCheck.violations) },
                    { status: 400 },
                )
            }
        }

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
            product.dimensions = validDimensions
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
                dimensions: validDimensions,
                discount: discount,
                slug: 'custom-print-request',
                hidden: true, // Hidden from shop listings
                schemaVersion: 3
            })
            await product.save()
        }

        return NextResponse.json({ success: true, product })
    } catch (error) {
        if (error instanceof UnauthorizedError) return unauthorizedResponse()
        console.error('Error saving custom print product:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
