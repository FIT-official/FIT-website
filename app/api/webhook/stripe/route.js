import { NextResponse } from "next/server";
import Stripe from "stripe";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import Product from "@/models/Product";
import PrintOrder from "@/models/PrintOrder";
import CheckoutSession from "@/models/CheckoutSession";
import Order from "@/models/Order";
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
            const orderItems = []; // For the new Order model

            // Fetch payment method details from Stripe
            let paymentMethodDetails = null;
            try {
                if (session.payment_intent) {
                    const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
                    if (paymentIntent.charges.data.length > 0) {
                        const charge = paymentIntent.charges.data[0];
                        const paymentMethod = charge.payment_method_details;

                        if (paymentMethod) {
                            paymentMethodDetails = {
                                type: paymentMethod.type,
                                brand: paymentMethod.card?.brand || paymentMethod.type,
                                last4: paymentMethod.card?.last4 || null,
                                expiryMonth: paymentMethod.card?.exp_month || null,
                                expiryYear: paymentMethod.card?.exp_year || null
                            };
                        }
                    }
                }
            } catch (error) {
                console.error('Error fetching payment method details:', error);
            }

            // Get shipping address from session
            const shippingAddress = session.shipping_details?.address || null;

            for (const item of user.cart) {
                const product = await Product.findById(item.productId);

                if (!product) {
                    console.error(`Product not found: ${item.productId}`);
                    continue;
                }

                // Build variant info
                let variantInfo = [];
                let variantFees = 0;
                if (item.selectedVariants && Object.keys(item.selectedVariants).length > 0) {
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
                                    variantFees += option.additionalFee || 0;
                                }
                            }
                        }
                    }
                }

                // Calculate pricing breakdown
                const basePrice = product.basePrice?.presentmentAmount || 0;
                const priceBeforeDiscount = basePrice + variantFees;
                const discount = (item.priceBeforeDiscount || priceBeforeDiscount) - (item.finalPrice || priceBeforeDiscount);
                const finalPrice = item.finalPrice || priceBeforeDiscount;
                const deliveryFee = item.deliveryFee || 0;
                const totalPrice = item.price || (finalPrice + deliveryFee);

                // Create order item for new Order model
                orderItems.push({
                    productId: item.productId,
                    productName: product.name,
                    productSlug: product.slug,
                    quantity: item.quantity || 1,
                    selectedVariants: item.selectedVariants || {},
                    variantInfo: variantInfo,
                    basePrice: basePrice,
                    variantFees: variantFees,
                    priceBeforeDiscount: priceBeforeDiscount,
                    discount: discount,
                    finalPrice: finalPrice,
                    deliveryFee: deliveryFee,
                    totalPrice: totalPrice,
                    currency: item.currency || product.basePrice?.presentmentCurrency || 'SGD',
                    chosenDeliveryType: item.chosenDeliveryType,
                    orderNote: item.orderNote || "",
                    requestId: item.requestId || null,
                    reviewed: false,
                    reviewId: null
                });

                // Add to order history with complete pricing breakdown (keep for backward compatibility)
                orders.push({
                    cartItem: {
                        productId: item.productId,
                        quantity: item.quantity,
                        selectedVariants: item.selectedVariants || {},
                        chosenDeliveryType: item.chosenDeliveryType,
                        orderNote: item.orderNote || "", // Include customer's order note
                        price: totalPrice, // Total price paid (final + delivery)
                        finalPrice: finalPrice, // Price after discount, before delivery
                        basePrice: basePrice, // Base price without variants
                        priceBeforeDiscount: priceBeforeDiscount, // Base + variants before discount
                        variantInfo: variantInfo, // Array of variant selections with fees
                        deliveryFee: deliveryFee,
                        currency: item.currency || 'SGD',
                    },
                    status: item.chosenDeliveryType === "digital" ? "delivered" : "pending",
                    stripeSessionId: session.id, // Store Stripe session ID for payment method retrieval
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

            // Create the comprehensive Order record
            const orderId = `ORD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const newOrder = new Order({
                orderId: orderId,
                userId: userId,
                stripeSessionId: session.id,
                stripePaymentIntentId: session.payment_intent || null,
                paymentMethod: paymentMethodDetails,
                customerEmail: session.customer_details?.email || user.email || "",
                customerName: session.customer_details?.name || "",
                shippingAddress: shippingAddress ? {
                    line1: shippingAddress.line1 || "",
                    line2: shippingAddress.line2 || "",
                    city: shippingAddress.city || "",
                    state: shippingAddress.state || "",
                    postalCode: shippingAddress.postal_code || "",
                    country: shippingAddress.country || ""
                } : undefined,
                items: orderItems,
                subtotal: orderItems.reduce((sum, item) => sum + item.finalPrice, 0),
                totalDiscount: orderItems.reduce((sum, item) => sum + item.discount, 0),
                totalDelivery: orderItems.reduce((sum, item) => sum + item.deliveryFee, 0),
                totalAmount: orderItems.reduce((sum, item) => sum + item.totalPrice, 0),
                currency: orderItems[0]?.currency || 'SGD',
                status: 'pending',
                statusHistory: [{
                    status: 'pending',
                    timestamp: new Date(),
                    updatedBy: 'system',
                    note: 'Order created from successful checkout'
                }],
                customerNote: orderItems.map(item => item.orderNote).filter(Boolean).join('; ') || ""
            });

            await newOrder.save();

            // Add orders to order history (keep for backward compatibility)
            user.orderHistory.push(...orders);

            // Empty the cart
            user.cart = [];
            await user.save();

            // console.log(`Successfully processed checkout for userId: ${userId}, sessionId: ${session.id}`);

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
