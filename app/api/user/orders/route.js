import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import Product from "@/models/Product";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { checkAdminPrivileges } from "@/lib/checkPrivileges";

export async function POST(req) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();

        // Only allow admins (via Clerk metadata) to query by productIds.
        const isAdmin = await checkAdminPrivileges(userId);
        if (!isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { productIds } = await req.json();
        if (!Array.isArray(productIds) || productIds.length === 0) {
            return NextResponse.json([], { status: 200 });
        }
        const users = await User.find(
            { "orderHistory.cartItem.productId": { $in: productIds } },
            { userId: 1, orderHistory: 1, contact: 1, _id: 0 }
        );

        const client = await clerkClient()

        const userInfos = await Promise.all(users.map(async (u) => {
            try {
                const clerkUser = await client.users.getUser(u.userId);
                return {
                    ...u.toObject(),
                    firstName: clerkUser.firstName,
                    emailAddresses: clerkUser.emailAddresses,
                    contact: u.contact,
                };
            } catch (e) {
                return {
                    ...u.toObject(),
                    firstName: null,
                    emailAddresses: [],
                    contact: u.contact,
                };
            }
        }));

        return NextResponse.json(userInfos);
    } catch (error) {
        console.error("Error fetching filtered users' orders:", error);
        return NextResponse.json({ error: "Failed to fetch users' orders" }, { status: 500 });
    }
}

export async function GET(req) {
    try {

        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        await connectToDatabase();
        const user = await User.findOne({ userId }, { orderHistory: 1, contact: 1, _id: 0 });
        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
        const { searchParams } = new URL(req.url);
        const orderId = searchParams.get('orderId');

        if (orderId) {
            const order = user.orderHistory.id(orderId);
            if (!order) {
                return NextResponse.json({ error: "Order not found" }, { status: 404 });
            }

            // Fetch user details from Clerk
            const client = await clerkClient();
            let clerkUser = null;
            try {
                clerkUser = await client.users.getUser(userId);
            } catch (err) {
                console.error("Error fetching Clerk user:", err);
            }

            return NextResponse.json({
                order,
                userDetails: {
                    name: clerkUser ? `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() : null,
                    email: clerkUser?.emailAddresses?.[0]?.emailAddress || null,
                    phone: clerkUser?.phoneNumbers?.[0]?.phoneNumber || null,
                    contact: user.contact || null
                }
            }, { status: 200 });
        }

        const orders = user.orderHistory ?? [];
        return NextResponse.json({ orders }, { status: 200 });
    } catch (error) {
        console.error("Error fetching user orders:", error);
        return NextResponse.json({ error: "Failed to fetch orders: " + error.message }, { status: 500 });
    }
}

export async function PUT(req) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();
        const { orderId, status, trackingId } = await req.json();

        if (!orderId) {
            return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
        }

        const user = await User.findOne({ "orderHistory._id": orderId });
        if (!user) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        const order = user.orderHistory.id(orderId);
        if (!order) {
            return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        // Access control: allow only
        // - the customer who owns the order
        // - an admin (determined via Clerk)
        // - the creator of the product attached to this order
        const actingUser = await User.findOne({ userId });
        const isAdmin = await checkAdminPrivileges(userId);
        const isCustomer = actingUser && actingUser.userId === user.userId;

        let isCreator = false;
        if (!isAdmin && !isCustomer) {
            const productId = order.cartItem?.productId;
            const isObjectIdString = (value) => typeof value === "string" && /^[0-9a-fA-F]{24}$/.test(value);
            if (productId && isObjectIdString(productId)) {
                const product = await Product.findById(productId).lean();
                if (product && product.creatorUserId === userId) {
                    isCreator = true;
                }
            }
        }

        if (!isAdmin && !isCustomer && !isCreator) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Update status if provided
        if (status && status !== order.status) {
            order.status = status;

            // Add to status history
            if (!order.statusHistory) {
                order.statusHistory = [];
            }
            order.statusHistory.push({
                status: status,
                timestamp: new Date(),
                updatedBy: isAdmin ? 'admin' : (isCustomer ? 'user' : 'creator')
            });
        }

        // Update tracking ID if provided (even if null to clear it)
        if (trackingId !== undefined) {
            order.trackingId = trackingId || null;
        }

        await user.save();

        return NextResponse.json({ success: true, order }, { status: 200 });
    } catch (error) {
        console.error("Error updating order:", error);
        return NextResponse.json({ error: "Failed to update order: " + error.message }, { status: 500 });
    }
}