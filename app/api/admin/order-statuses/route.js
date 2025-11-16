import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import AppSettings from "@/models/AppSettings";
import { authenticate } from "@/lib/authenticate";

export async function GET(request) {
    try {
        await connectToDatabase();

        // Get app settings for additional statuses
        let settings = await AppSettings.findById("app-settings");
        if (!settings) {
            settings = { additionalOrderStatuses: [] };
        }

        // Hardcoded order statuses from User model
        const hardcodedOrderStatuses = [
            { statusKey: "pending", displayName: "Pending", orderType: "order", color: "#f59e0b", isHardcoded: true },
            { statusKey: "processing", displayName: "Processing", orderType: "order", color: "#3b82f6", isHardcoded: true },
            { statusKey: "confirmed", displayName: "Confirmed", orderType: "order", color: "#10b981", isHardcoded: true },
            { statusKey: "shipped", displayName: "Shipped", orderType: "order", color: "#6366f1", isHardcoded: true },
            { statusKey: "delivered", displayName: "Delivered", orderType: "order", color: "#22c55e", isHardcoded: true },
            { statusKey: "cancelled", displayName: "Cancelled", orderType: "order", color: "#ef4444", isHardcoded: true },
            { statusKey: "on_hold", displayName: "On Hold", orderType: "order", color: "#f97316", isHardcoded: true },
            { statusKey: "refunded", displayName: "Refunded", orderType: "order", color: "#8b5cf6", isHardcoded: true },
            { statusKey: "partially_refunded", displayName: "Partially Refunded", orderType: "order", color: "#a855f7", isHardcoded: true }
        ];

        const hardcodedPrintOrderStatuses = [
            { statusKey: "pending_config", displayName: "Pending Configuration", orderType: "printOrder", color: "#f59e0b", isHardcoded: true },
            { statusKey: "configured", displayName: "Configured", orderType: "printOrder", color: "#3b82f6", isHardcoded: true },
            { statusKey: "printing", displayName: "Printing", orderType: "printOrder", color: "#8b5cf6", isHardcoded: true },
            { statusKey: "printed", displayName: "Printed", orderType: "printOrder", color: "#10b981", isHardcoded: true },
            { statusKey: "shipped", displayName: "Shipped", orderType: "printOrder", color: "#6366f1", isHardcoded: true },
            { statusKey: "delivered", displayName: "Delivered", orderType: "printOrder", color: "#22c55e", isHardcoded: true },
            { statusKey: "cancelled", displayName: "Cancelled", orderType: "printOrder", color: "#ef4444", isHardcoded: true },
            { statusKey: "failed", displayName: "Failed", orderType: "printOrder", color: "#dc2626", isHardcoded: true },
            { statusKey: "on_hold", displayName: "On Hold", orderType: "printOrder", color: "#f97316", isHardcoded: true }
        ];

        const { searchParams } = new URL(request.url);
        const orderType = searchParams.get('orderType');

        let allOrderStatuses = [
            ...hardcodedOrderStatuses,
            ...hardcodedPrintOrderStatuses,
            ...settings.additionalOrderStatuses.map(os => ({ ...os.toObject(), isHardcoded: false }))
        ];

        // Filter by order type if specified
        if (orderType) {
            allOrderStatuses = allOrderStatuses.filter(os => os.orderType === orderType);
        }

        return NextResponse.json({
            orderStatuses: allOrderStatuses,
            additionalOrderStatuses: settings.additionalOrderStatuses
        }, { status: 200 });
    } catch (error) {
        console.error("Error fetching order statuses:", error);
        return NextResponse.json(
            { error: "Failed to fetch order statuses" },
            { status: 500 }
        );
    }
}

export async function POST(request) {
    try {
        const { userId } = await authenticate(request);

        await connectToDatabase();

        const {
            statusKey,
            displayName,
            description = "",
            orderType,
            color = "#6b7280",
            canBeSetBy = ["system"],
            order = 0,
            isActive = true
        } = await request.json();

        if (!statusKey || !displayName || !orderType) {
            return NextResponse.json(
                { error: "StatusKey, displayName, and orderType are required" },
                { status: 400 }
            );
        }

        if (!['order', 'printOrder'].includes(orderType)) {
            return NextResponse.json(
                { error: "OrderType must be 'order' or 'printOrder'" },
                { status: 400 }
            );
        }

        const validCanBeSetBy = ["system", "admin", "creator", "user"];
        if (!canBeSetBy.every(role => validCanBeSetBy.includes(role))) {
            return NextResponse.json(
                { error: "Invalid role in canBeSetBy" },
                { status: 400 }
            );
        }

        const orderStatus = new OrderStatusConfig({
            statusKey: statusKey.trim(),
            displayName: displayName.trim(),
            description: description.trim(),
            orderType,
            color: color.trim(),
            canBeSetBy,
            order: parseInt(order),
            isActive
        });

        await orderStatus.save();

        return NextResponse.json({ orderStatus }, { status: 201 });
    } catch (error) {
        console.error("Error creating order status:", error);

        if (error.code === 11000) {
            return NextResponse.json(
                { error: "Order status key already exists" },
                { status: 409 }
            );
        }

        return NextResponse.json(
            { error: "Failed to create order status" },
            { status: 500 }
        );
    }
}

export async function PUT(request) {
    try {
        const { userId } = await authenticate(request);
        await connectToDatabase();

        const {
            id,
            statusKey,
            displayName,
            description,
            orderType,
            color,
            canBeSetBy,
            order,
            isActive
        } = await request.json();

        if (!id) {
            return NextResponse.json(
                { error: "Order status ID is required" },
                { status: 400 }
            );
        }

        const updateData = {};
        if (statusKey !== undefined) updateData.statusKey = statusKey.trim();
        if (displayName !== undefined) updateData.displayName = displayName.trim();
        if (description !== undefined) updateData.description = description.trim();
        if (orderType !== undefined) {
            if (!['order', 'printOrder'].includes(orderType)) {
                return NextResponse.json(
                    { error: "OrderType must be 'order' or 'printOrder'" },
                    { status: 400 }
                );
            }
            updateData.orderType = orderType;
        }
        if (color !== undefined) updateData.color = color.trim();
        if (canBeSetBy !== undefined) {
            const validCanBeSetBy = ["system", "admin", "creator", "user"];
            if (!canBeSetBy.every(role => validCanBeSetBy.includes(role))) {
                return NextResponse.json(
                    { error: "Invalid role in canBeSetBy" },
                    { status: 400 }
                );
            }
            updateData.canBeSetBy = canBeSetBy;
        }
        if (order !== undefined) updateData.order = parseInt(order);
        if (isActive !== undefined) updateData.isActive = isActive;

        const orderStatus = await OrderStatusConfig.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!orderStatus) {
            return NextResponse.json(
                { error: "Order status not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({ orderStatus }, { status: 200 });
    } catch (error) {
        console.error("Error updating order status:", error);
        return NextResponse.json(
            { error: "Failed to update order status" },
            { status: 500 }
        );
    }
}

export async function DELETE(request) {
    try {
        const { userId } = await authenticate(request);

        await connectToDatabase();

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: "Order status ID is required" },
                { status: 400 }
            );
        }

        const orderStatus = await OrderStatusConfig.findByIdAndDelete(id);

        if (!orderStatus) {
            return NextResponse.json(
                { error: "Order status not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({ message: "Order status deleted successfully" }, { status: 200 });
    } catch (error) {
        console.error("Error deleting order status:", error);
        return NextResponse.json(
            { error: "Failed to delete order status" },
            { status: 500 }
        );
    }
}