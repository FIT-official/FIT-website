import { NextResponse } from "next/server";
import Stripe from "stripe";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import Product from "@/models/Product";
import PrintOrder from "@/models/PrintOrder";
import CheckoutSession from "@/models/CheckoutSession";
import mongoose from "mongoose";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-05-28.basil",
});

const webhookSecret = process.env.STRIPE_SESSION_COMPLETE_SIGNING_SECRET;

export const dynamic = 'force-dynamic';

export async function POST(req) {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    let event;

    try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return NextResponse.json(
            { error: `Webhook Error: ${err.message}` },
            { status: 400 }
        );
    }

    // Handle the checkout.session.completed event
    if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        try {
            await connectToDatabase();

            // Get the checkout session data from MongoDB
            const checkoutSessionData = await CheckoutSession.findOne({
                sessionId: session.id,
            });

            if (!checkoutSessionData) {
                console.error(`CheckoutSession not found for sessionId: ${session.id}`);
                return NextResponse.json(
                    { error: "Checkout session not found" },
                    { status: 404 }
                );
            }

            const userId = checkoutSessionData.userId;
            const user = await User.findOne({ userId });

            if (!user) {
                console.error(`User not found for userId: ${userId}`);
                return NextResponse.json(
                    { error: "User not found" },
                    { status: 404 }
                );
            }

            // Create order history entries and handle print orders
            const orders = [];
            const printOrderPromises = [];

            for (const item of user.cart) {
                const product = await Product.findById(item.productId);

                if (!product) {
                    console.error(`Product not found: ${item.productId}`);
                    continue;
                }

                // Add to order history with complete pricing breakdown
                orders.push({
                    cartItem: {
                        productId: item.productId,
                        quantity: item.quantity,
                        selectedVariants: item.selectedVariants || {},
                        chosenDeliveryType: item.chosenDeliveryType,
                        orderNote: item.orderNote || "", // Include customer's order note
                        price: item.price, // Total price paid (final + delivery)
                        finalPrice: item.finalPrice, // Price after discount, before delivery
                        basePrice: item.basePrice, // Base price without variants
                        priceBeforeDiscount: item.priceBeforeDiscount, // Base + variants before discount
                        variantInfo: item.variantInfo || [], // Array of variant selections with fees
                        deliveryFee: item.deliveryFee || 0,
                        currency: item.currency || 'SGD',
                    },
                    status: item.chosenDeliveryType === "digital" ? "delivered" : "pending",
                });

                // Update product sales
                product.sales.push({
                    userId,
                    quantity: item.quantity,
                    price: item.price || 0,
                });
                await product.save();

                // Create print orders for print delivery items
                if (item.chosenDeliveryType === "printDelivery") {
                    // Find creator user
                    const creatorUser = await User.findOne({ userId: product.creatorUserId });
                    if (!creatorUser) {
                        console.error(`Creator user not found for userId: ${product.creatorUserId}`);
                        continue;
                    }

                    // Generate unique order ID
                    const orderId = `PO_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                    // Get variant info from selectedVariants
                    let variantName = null;
                    let variantInfo = [];
                    if (item.selectedVariants && Object.keys(item.selectedVariants).length > 0) {
                        variantName = Object.entries(item.selectedVariants)
                            .map(([type, option]) => `${type}: ${option}`)
                            .join(", ");

                        // Build variantInfo with fees
                        if (product.variantTypes && product.variantTypes.length > 0) {
                            for (const [variantTypeName, selectedOption] of Object.entries(item.selectedVariants)) {
                                const variantType = product.variantTypes.find(vt => vt.name === variantTypeName);
                                if (variantType) {
                                    const option = variantType.options.find(opt => opt.name === selectedOption);
                                    if (option) {
                                        variantInfo.push({
                                            type: variantTypeName,
                                            option: selectedOption,
                                            additionalFee: option.additionalFee || 0
                                        });
                                    }
                                }
                            }
                        }
                    }

                    // Calculate base price
                    let basePrice = product.basePrice?.presentmentAmount || 0;
                    let totalPrice = basePrice;

                    // Add variant fees
                    if (variantInfo.length > 0) {
                        const variantFees = variantInfo.reduce((sum, v) => sum + v.additionalFee, 0);
                        totalPrice += variantFees;
                    }

                    const printOrderData = {
                        orderId: orderId,
                        stripeSessionId: session.id,
                        userId: new mongoose.Types.ObjectId(user._id),
                        creatorId: new mongoose.Types.ObjectId(creatorUser._id),
                        productId: item.productId,
                        productTitle: product.name,
                        quantity: item.quantity || 1,
                        basePrice: basePrice,
                        printFee: 0, // Can be calculated later
                        deliveryFee: item.deliveryFee || 0,
                        totalAmount: totalPrice,
                        selectedVariants: item.selectedVariants || {},
                        variantInfo: variantInfo,
                        variantName: variantName,
                        currency: product.basePrice?.presentmentCurrency || 'SGD',
                        modelUrl: product.viewableModel,
                        status: 'pending_config',
                    };

                    // If print configuration was stored in cart item before checkout, use it
                    if (item.printConfiguration) {
                        printOrderData.printConfiguration = item.printConfiguration;
                        printOrderData.status = 'configured';
                        printOrderData.printConfiguration.configuredAt = new Date();
                    }

                    printOrderPromises.push(new PrintOrder(printOrderData).save());
                }
            }

            // Wait for all print orders to be created
            await Promise.all(printOrderPromises);

            // Add orders to order history
            user.orderHistory.push(...orders);

            // Empty the cart
            user.cart = [];
            await user.save();

            console.log(`Successfully processed checkout for userId: ${userId}, sessionId: ${session.id}`);

            return NextResponse.json({ received: true }, { status: 200 });
        } catch (error) {
            console.error("Error processing webhook:", error);
            return NextResponse.json(
                { error: "Failed to process webhook" },
                { status: 500 }
            );
        }
    }

    // Return 200 for other event types
    return NextResponse.json({ received: true }, { status: 200 });
}
