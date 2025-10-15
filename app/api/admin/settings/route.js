import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/db";
import AppSettings from "@/models/AppSettings";

// Helper function to get or create app settings
async function getAppSettings() {
    let settings = await AppSettings.findById("app-settings");
    if (!settings) {
        settings = new AppSettings({
            _id: "app-settings",
            additionalDeliveryTypes: [],
            additionalOrderStatuses: [],
            additionalCategories: []
        });
        await settings.save();
    }
    return settings;
}

// Helper function to check admin access (same logic as useAccess)
async function checkAdminAccess(userId) {
    try {
        const client = await clerkClient();
        const user = await client.users.getUser(userId);

        // Check role
        const userRole = user.publicMetadata.role || "user";
        const isAdmin = userRole === "admin";

        // Check subscription
        const priceId = user.unsafeMetadata?.priceId || null;
        const hasValidSub = typeof priceId === 'string' && priceId.trim().length > 0;

        // Allow access if has valid subscription OR is admin
        return hasValidSub || isAdmin;
    } catch (error) {
        console.error("Error checking admin access:", error);
        return false;
    }
}

export async function GET(request) {
    try {
        await connectToDatabase();
        const settings = await getAppSettings();

        // Return both hardcoded and additional delivery types
        const hardcodedDeliveryTypes = [
            { name: "digital", displayName: "Digital Download", applicableToProductTypes: ["shop"], isActive: true, isHardcoded: true },
            { name: "selfCollect", displayName: "Self Collection", applicableToProductTypes: ["shop", "print"], isActive: true, isHardcoded: true },
            { name: "singpost", displayName: "SingPost Delivery", applicableToProductTypes: ["shop", "print"], isActive: true, isHardcoded: true },
            { name: "privateDelivery", displayName: "Private Delivery", applicableToProductTypes: ["shop", "print"], isActive: true, isHardcoded: true }
        ];

        const allDeliveryTypes = [
            ...hardcodedDeliveryTypes,
            ...settings.additionalDeliveryTypes.map(dt => ({ ...dt.toObject(), isHardcoded: false }))
        ];

        // Hardcoded categories from categories.js
        const hardcodedCategories = [
            // Shop categories
            { name: "electronics", displayName: "Electronics", type: "shop", isActive: true, isHardcoded: true },
            { name: "filament", displayName: "Filament", type: "shop", isActive: true, isHardcoded: true },
            { name: "printer", displayName: "Printer", type: "shop", isActive: true, isHardcoded: true },
            { name: "accessories", displayName: "Accessories", type: "shop", isActive: true, isHardcoded: true },
            { name: "power-tools", displayName: "Power Tools", type: "shop", isActive: true, isHardcoded: true },
            { name: "gears", displayName: "Gears", type: "shop", isActive: true, isHardcoded: true },
            // Print categories
            { name: "trending-prints", displayName: "Trending Prints", type: "print", isActive: true, isHardcoded: true },
            { name: "games", displayName: "Games", type: "print", isActive: true, isHardcoded: true },
            { name: "educational", displayName: "Educational", type: "print", isActive: true, isHardcoded: true },
            { name: "display", displayName: "Display", type: "print", isActive: true, isHardcoded: true },
            { name: "for-him", displayName: "For Him", type: "print", isActive: true, isHardcoded: true },
            { name: "adda", displayName: "Adda", type: "print", isActive: true, isHardcoded: true }
        ];

        const allCategories = [
            ...hardcodedCategories,
            ...(settings.additionalCategories || []).map(cat => ({ ...cat.toObject(), isHardcoded: false }))
        ];

        return NextResponse.json({
            deliveryTypes: allDeliveryTypes,
            additionalDeliveryTypes: settings.additionalDeliveryTypes,
            categories: allCategories,
            additionalCategories: settings.additionalCategories || []
        }, { status: 200 });
    } catch (error) {
        console.error("Error fetching app settings:", error);
        return NextResponse.json(
            { error: "Failed to fetch app settings" },
            { status: 500 }
        );
    }
}

export async function POST(request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (!(await checkAdminAccess(userId))) {
            return NextResponse.json({ error: "Access denied. Valid subscription or admin role required." }, { status: 403 });
        }

        await connectToDatabase();

        const { type, data } = await request.json();

        if (!type || !data) {
            return NextResponse.json(
                { error: "Type and data are required" },
                { status: 400 }
            );
        }

        const settings = await getAppSettings();

        if (type === "delivery-type") {
            const { name, displayName, description = "", feeName = "", applicableToProductTypes = ["shop"], order = 0, isActive = true } = data;

            if (!name || !displayName) {
                return NextResponse.json(
                    { error: "Name and displayName are required" },
                    { status: 400 }
                );
            }

            // Check if delivery type already exists in additional types
            const exists = settings.additionalDeliveryTypes.some(dt => dt.name === name);
            if (exists) {
                return NextResponse.json(
                    { error: "Delivery type name already exists" },
                    { status: 409 }
                );
            }

            settings.additionalDeliveryTypes.push({
                name: name.trim(),
                displayName: displayName.trim(),
                description: description.trim(),
                feeName: feeName.trim(),
                applicableToProductTypes,
                order: parseInt(order),
                isActive
            });

            await settings.save();

            return NextResponse.json({ message: "Delivery type added successfully" }, { status: 201 });

        } else if (type === "order-status") {
            const { statusKey, displayName, description = "", orderType, color = "#6b7280", order = 0, isActive = true } = data;

            if (!statusKey || !displayName || !orderType) {
                return NextResponse.json(
                    { error: "StatusKey, displayName, and orderType are required" },
                    { status: 400 }
                );
            }

            // Check if order status already exists in additional statuses
            const exists = settings.additionalOrderStatuses.some(os => os.statusKey === statusKey && os.orderType === orderType);
            if (exists) {
                return NextResponse.json(
                    { error: "Order status already exists for this order type" },
                    { status: 409 }
                );
            }

            settings.additionalOrderStatuses.push({
                statusKey: statusKey.trim(),
                displayName: displayName.trim(),
                description: description.trim(),
                orderType,
                color: color.trim(),
                order: parseInt(order),
                isActive
            });

            await settings.save();

            return NextResponse.json({ message: "Order status added successfully" }, { status: 201 });

        } else if (type === "category") {
            const { name, displayName, type: categoryType, description = "", order = 0, isActive = true } = data;

            if (!name || !displayName || !categoryType) {
                return NextResponse.json(
                    { error: "Name, displayName, and type are required" },
                    { status: 400 }
                );
            }

            // Check if category already exists
            const exists = (settings.additionalCategories || []).some(cat => cat.name === name && cat.type === categoryType);
            if (exists) {
                return NextResponse.json(
                    { error: "Category name already exists for this type" },
                    { status: 409 }
                );
            }

            if (!settings.additionalCategories) {
                settings.additionalCategories = [];
            }

            settings.additionalCategories.push({
                name: name.trim(),
                displayName: displayName.trim(),
                type: categoryType,
                description: description.trim(),
                order: parseInt(order),
                isActive
            });

            await settings.save();

            return NextResponse.json({ message: "Category added successfully" }, { status: 201 });

        } else {
            return NextResponse.json(
                { error: "Invalid type. Must be 'deliveryType', 'orderStatus', or 'category'" },
                { status: 400 }
            );
        }

    } catch (error) {
        console.error("Error updating app settings:", error);
        return NextResponse.json(
            { error: "Failed to update app settings" },
            { status: 500 }
        );
    }
}

export async function PUT(request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (!(await checkAdminAccess(userId))) {
            return NextResponse.json({ error: "Access denied. Valid subscription or admin role required." }, { status: 403 });
        }

        await connectToDatabase();

        const { type, id, data } = await request.json();

        if (!type || !id || !data) {
            return NextResponse.json(
                { error: "Type, id, and data are required" },
                { status: 400 }
            );
        }

        const settings = await getAppSettings();

        if (type === "delivery-type") {
            const deliveryType = settings.additionalDeliveryTypes.id(id);
            if (!deliveryType) {
                return NextResponse.json(
                    { error: "Delivery type not found" },
                    { status: 404 }
                );
            }

            Object.assign(deliveryType, data);
            await settings.save();

            return NextResponse.json({ message: "Delivery type updated successfully" }, { status: 200 });

        } else if (type === "order-status") {
            const orderStatus = settings.additionalOrderStatuses.id(id);
            if (!orderStatus) {
                return NextResponse.json(
                    { error: "Order status not found" },
                    { status: 404 }
                );
            }

            Object.assign(orderStatus, data);
            await settings.save();

            return NextResponse.json({ message: "Order status updated successfully" }, { status: 200 });

        } else if (type === "category") {
            const category = settings.additionalCategories.id(id);
            if (!category) {
                return NextResponse.json(
                    { error: "Category not found" },
                    { status: 404 }
                );
            }

            Object.assign(category, data);
            await settings.save();

            return NextResponse.json({ message: "Category updated successfully" }, { status: 200 });

        } else {
            return NextResponse.json(
                { error: "Invalid type. Must be 'delivery-type', 'order-status', or 'category'" },
                { status: 400 }
            );
        }

    } catch (error) {
        console.error("Error updating app settings:", error);
        return NextResponse.json(
            { error: "Failed to update app settings" },
            { status: 500 }
        );
    }
}

export async function DELETE(request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (!(await checkAdminAccess(userId))) {
            return NextResponse.json({ error: "Access denied. Valid subscription or admin role required." }, { status: 403 });
        }

        await connectToDatabase();

        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type');
        const id = searchParams.get('id');

        if (!type || !id) {
            return NextResponse.json(
                { error: "Type and id are required" },
                { status: 400 }
            );
        }

        const settings = await getAppSettings();

        if (type === "delivery-type") {
            const deliveryType = settings.additionalDeliveryTypes.id(id);
            if (!deliveryType) {
                return NextResponse.json(
                    { error: "Delivery type not found" },
                    { status: 404 }
                );
            }

            settings.additionalDeliveryTypes.pull(id);
            await settings.save();

            return NextResponse.json({ message: "Delivery type deleted successfully" }, { status: 200 });

        } else if (type === "order-status") {
            const orderStatus = settings.additionalOrderStatuses.id(id);
            if (!orderStatus) {
                return NextResponse.json(
                    { error: "Order status not found" },
                    { status: 404 }
                );
            }

            settings.additionalOrderStatuses.pull(id);
            await settings.save();

            return NextResponse.json({ message: "Order status deleted successfully" }, { status: 200 });

        } else if (type === "category") {
            const category = settings.additionalCategories.id(id);
            if (!category) {
                return NextResponse.json(
                    { error: "Category not found" },
                    { status: 404 }
                );
            }

            settings.additionalCategories.pull(id);
            await settings.save();

            return NextResponse.json({ message: "Category deleted successfully" }, { status: 200 });

        } else {
            return NextResponse.json(
                { error: "Invalid type. Must be 'delivery-type', 'order-status', or 'category'" },
                { status: 400 }
            );
        }

    } catch (error) {
        console.error("Error deleting from app settings:", error);
        return NextResponse.json(
            { error: "Failed to delete from app settings" },
            { status: 500 }
        );
    }
}