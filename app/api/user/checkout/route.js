import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import Product from "@/models/Product";
import User from "@/models/User";
import PrintOrder from "@/models/PrintOrder";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function POST(req) {
    try {
        const { userId } = await auth();
        if (!userId)
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json();
        const { printConfigurations } = body; // Expect print configurations from client

        await connectToDatabase();
        const user = await User.findOne({ userId });
        if (!user)
            return NextResponse.json({ error: "User data not found" }, { status: 404 });

        const orders = user.cart.map(item => ({
            cartItem: {
                productId: item.productId,
                quantity: item.quantity,
                variantId: item.variantId,
                chosenDeliveryType: item.chosenDeliveryType,
                price: item.price,
            },
            status: item.chosenDeliveryType === "digital" ? "delivered" : "pending",
        }));

        // Process print delivery items separately
        const printOrderPromises = [];

        for (const item of user.cart) {
            const product = await Product.findById(item.productId);
            if (product) {
                product.sales.push({
                    userId,
                    quantity: item.quantity,
                    price: item.price || 0,
                });
                await product.save();

                // Create print orders for print delivery items
                if (item.chosenDeliveryType === "printDelivery") {
                    const variant = product.variants?.find(v =>
                        (v._id && v._id.toString() === item.variantId) || v === item.variantId
                    );

                    // Find creator user by Clerk userId
                    const creatorUser = await User.findOne({ userId: product.creatorUserId });
                    if (!creatorUser) {
                        console.error(`Creator user not found for userId: ${product.creatorUserId}`);
                        continue; // Skip this item if creator not found
                    }

                    // Generate unique order ID
                    const orderId = `PO_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                    const printOrderData = {
                        // Required fields from PrintOrder schema
                        orderId: orderId,
                        stripeSessionId: `temp_${orderId}`, // Temporary until Stripe session is created
                        userId: new mongoose.Types.ObjectId(user._id), // Convert to ObjectId
                        creatorId: new mongoose.Types.ObjectId(creatorUser._id), // Use creator's MongoDB _id
                        productId: item.productId,
                        productTitle: product.name, // Use productTitle not productName
                        quantity: item.quantity || 1,
                        basePrice: variant?.price?.presentmentAmount || product.variants?.[0]?.price?.presentmentAmount || 0,
                        printFee: 0, // Default print fee - can be calculated later
                        deliveryFee: 0, // Default delivery fee - can be calculated later
                        totalAmount: variant?.price?.presentmentAmount || product.variants?.[0]?.price?.presentmentAmount || 0,

                        // Additional fields
                        variantId: item.variantId || null,
                        variantName: variant?.name || null,
                        currency: variant?.price?.presentmentCurrency || product.variants?.[0]?.price?.presentmentCurrency || 'USD',
                        modelUrl: product.viewableModel,
                        status: 'pending_config', // Will be updated if configuration provided
                    };

                    // Add configuration if provided
                    const configKey = `${item.productId}_${item.variantId || 'default'}`;
                    if (printConfigurations && printConfigurations[configKey]) {
                        printOrderData.printConfiguration = printConfigurations[configKey];
                        printOrderData.status = 'configured';
                        printOrderData.printConfiguration.configuredAt = new Date();
                    }

                    printOrderPromises.push(new PrintOrder(printOrderData).save());
                }
            }
        }

        // Wait for all print orders to be created
        await Promise.all(printOrderPromises);

        user.orderHistory.push(...orders);
        user.cart = [];
        await user.save();

        return NextResponse.json({ message: "Checkout successful" }, { status: 200 });
    } catch (error) {
        console.error("Error during checkout:", error);
        return NextResponse.json({ error: "Failed to process checkout" }, { status: 500 });
    }
}
