import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";

function getAppSettingsId() {
    return process.env.NODE_ENV === 'development' ? 'app-settings-dev' : 'app-settings';
}
import AppSettings from "@/models/AppSettings";
import { authenticate } from "@/lib/authenticate";
import { checkAdminPrivileges } from "@/lib/checkPrivileges";

export async function GET(request) {
    try {
        await connectToDatabase();

        // Get app settings for additional statuses
        let settings = await AppSettings.findById(getAppSettingsId());
        if (!settings) {
            settings = { additionalOrderStatuses: [] };
        }

        // Hardcoded order statuses from User model
        const hardcodedOrderStatuses = [
            { statusKey: "pending", displayName: "Pending", orderType: "order", color: "#f59e0b", order: 0, icon: "TbClock", isHardcoded: true },
            { statusKey: "processing", displayName: "Processing", orderType: "order", color: "#3b82f6", order: 10, icon: "TbTruckDelivery", isHardcoded: true },
            { statusKey: "confirmed", displayName: "Confirmed", orderType: "order", color: "#10b981", order: 20, icon: "IoMdCheckmarkCircleOutline", isHardcoded: true },
            { statusKey: "shipped", displayName: "Shipped", orderType: "order", color: "#6366f1", order: 30, icon: "FiTruck", isHardcoded: true },
            { statusKey: "delivered", displayName: "Delivered", orderType: "order", color: "#22c55e", order: 40, icon: "FiPackage", isHardcoded: true },
            { statusKey: "cancelled", displayName: "Cancelled", orderType: "order", color: "#ef4444", order: 50, icon: "TbX", isHardcoded: true },
            { statusKey: "on_hold", displayName: "On Hold", orderType: "order", color: "#f97316", order: 60, icon: "TbClock", isHardcoded: true },
            { statusKey: "refunded", displayName: "Refunded", orderType: "order", color: "#8b5cf6", order: 70, icon: "TbChecks", isHardcoded: true },
            { statusKey: "partially_refunded", displayName: "Partially Refunded", orderType: "order", color: "#a855f7", order: 80, icon: "BiPackage", isHardcoded: true }
        ];

        const hardcodedPrintOrderStatuses = [
            { statusKey: "pending_config", displayName: "Pending Configuration", orderType: "printOrder", color: "#f59e0b", order: 0, icon: "TbClock", isHardcoded: true },
            { statusKey: "configured", displayName: "Configured", orderType: "printOrder", color: "#3b82f6", order: 10, icon: "IoMdPrint", isHardcoded: true },
            { statusKey: "printing", displayName: "Printing", orderType: "printOrder", color: "#8b5cf6", order: 20, icon: "IoMdPrint", isHardcoded: true },
            { statusKey: "printed", displayName: "Printed", orderType: "printOrder", color: "#10b981", order: 30, icon: "FiCheck", isHardcoded: true },
            { statusKey: "shipped", displayName: "Shipped", orderType: "printOrder", color: "#6366f1", order: 40, icon: "FiTruck", isHardcoded: true },
            { statusKey: "delivered", displayName: "Delivered", orderType: "printOrder", color: "#22c55e", order: 50, icon: "FiPackage", isHardcoded: true },
            { statusKey: "cancelled", displayName: "Cancelled", orderType: "printOrder", color: "#ef4444", order: 60, icon: "TbX", isHardcoded: true },
            { statusKey: "failed", displayName: "Failed", orderType: "printOrder", color: "#dc2626", order: 70, icon: "TbX", isHardcoded: true },
            { statusKey: "on_hold", displayName: "On Hold", orderType: "printOrder", color: "#f97316", order: 80, icon: "TbClock", isHardcoded: true }
        ];

        const { searchParams } = new URL(request.url);
        const orderType = searchParams.get('orderType');

        let allOrderStatuses = [
            ...hardcodedOrderStatuses,
            ...hardcodedPrintOrderStatuses,
            ...settings.additionalOrderStatuses.map(os => ({ ...os.toObject(), isHardcoded: false }))
        ];

        // Ensure statuses are ordered by their display order, regardless of source
        allOrderStatuses.sort((a, b) => {
            const aOrder = typeof a.order === 'number' ? a.order : 0;
            const bOrder = typeof b.order === 'number' ? b.order : 0;
            return aOrder - bOrder;
        });

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

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const isAdmin = await checkAdminPrivileges(userId);
        if (!isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

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

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const isAdmin = await checkAdminPrivileges(userId);
        if (!isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
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

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const isAdmin = await checkAdminPrivileges(userId);
        if (!isAdmin) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

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