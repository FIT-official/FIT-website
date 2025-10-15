import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/db";
import PrintOrder from "@/models/PrintOrder";
import Product from "@/models/Product";
import User from "@/models/User";

export async function POST(req) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { productId, variantId, deliveryType } = await req.json();

        if (!productId || deliveryType !== 'printDelivery') {
            return NextResponse.json({ error: "Invalid print order data" }, { status: 400 });
        }

        await connectToDatabase();

        // Get product details
        const product = await Product.findById(productId);
        if (!product) {
            return NextResponse.json({ error: "Product not found" }, { status: 404 });
        }

        // Ensure product has a 3D model
        if (!product.viewableModel) {
            return NextResponse.json({ error: "Product does not support printing" }, { status: 400 });
        }

        // Get variant details if specified
        let selectedVariant = null;
        if (variantId && product.variants) {
            selectedVariant = product.variants.find(v => v._id.toString() === variantId);
        }

        // Use variant price if available, otherwise product price
        const price = selectedVariant?.price || product.variants?.[0]?.price;
        if (!price) {
            return NextResponse.json({ error: "Product price not found" }, { status: 400 });
        }

        // Get user details
        const user = await User.findOne({ clerkId: userId });
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Create print order
        const printOrder = new PrintOrder({
            userId: userId,
            creatorUserId: product.creatorUserId,
            productId: productId,
            variantId: variantId || null,
            productName: product.name,
            variantName: selectedVariant?.name || null,
            price: {
                presentmentCurrency: price.presentmentCurrency,
                presentmentAmount: price.presentmentAmount,
            },
            modelUrl: product.viewableModel, // Store the model URL for reference
            status: 'pending_config', // User needs to configure print settings
            // configurationDeadline is set automatically by the schema (7 days from now)
        });

        const savedOrder = await printOrder.save();

        return NextResponse.json({
            orderId: savedOrder._id,
            message: "Print order created successfully"
        }, { status: 201 });

    } catch (error) {
        console.error("Error creating print order:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function GET(req) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();

        // Get all print orders for the user
        const printOrders = await PrintOrder.find({ userId })
            .sort({ createdAt: -1 })
            .lean();

        return NextResponse.json({ printOrders }, { status: 200 });

    } catch (error) {
        console.error("Error fetching print orders:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}