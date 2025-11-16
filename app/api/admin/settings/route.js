import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import AppSettings from "@/models/AppSettings";
import { checkAdminPrivileges } from "@/lib/checkPrivileges";
import { authenticate } from "@/lib/authenticate";

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


export async function GET(request) {
    try {
        await connectToDatabase();
        const settings = await getAppSettings();
        const hardcodedDeliveryTypes = [
            {
                name: "digital",
                displayName: "Digital Download",
                description: "Instant download after purchase",
                applicableToProductTypes: ["shop"],
                pricingTiers: [],
                hasDefaultPrice: false,
                isActive: true,
                isHardcoded: true
            }
        ];

        const allDeliveryTypes = [
            ...hardcodedDeliveryTypes,
            ...settings.additionalDeliveryTypes.map(dt => ({ ...dt.toObject(), isHardcoded: false }))
        ];

        const dbCategories = (settings.additionalCategories || []).map(cat => ({ ...cat.toObject(), isHardcoded: false }));

        return NextResponse.json({
            deliveryTypes: allDeliveryTypes,
            additionalDeliveryTypes: settings.additionalDeliveryTypes,
            categories: dbCategories,
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
        const { userId } = await authenticate(request);

        if (!(await checkAdminPrivileges(userId))) {
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

        if (type === "deliveryType") {
            const { name, displayName, description = "", applicableToProductTypes = ["shop"], pricingTiers = [], order = 0, isActive = true } = data;

            if (!name || !displayName) {
                return NextResponse.json(
                    { error: "Name and displayName are required" },
                    { status: 400 }
                );
            }

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
                applicableToProductTypes,
                pricingTiers,
                hasDefaultPrice: pricingTiers && pricingTiers.length > 0,
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

        } else if (type === "subcategory") {
            // data should include: parentId (optional) or parentName, name, displayName, isActive
            const { parentId, parentName, name, displayName, isActive = true } = data;
            if (!name || !displayName || (!parentId && !parentName)) {
                return NextResponse.json({ error: "parentId or parentName, name and displayName are required" }, { status: 400 });
            }

            // Find parent category
            let parent = null;
            if (parentId) {
                parent = (settings.additionalCategories || []).id(parentId);
            } else if (parentName) {
                parent = (settings.additionalCategories || []).find(cat => cat.name === parentName || cat.displayName === parentName);
            }

            if (!parent) {
                return NextResponse.json({ error: "Parent category not found" }, { status: 404 });
            }

            parent.subcategories = parent.subcategories || [];
            // Check for existing subcategory
            const existsSub = parent.subcategories.some(sc => sc.name === name);
            if (existsSub) {
                return NextResponse.json({ error: "Subcategory name already exists for this category" }, { status: 409 });
            }

            parent.subcategories.push({ name: name.trim(), displayName: displayName.trim(), isActive });
            await settings.save();

            return NextResponse.json({ message: "Subcategory added successfully" }, { status: 201 });

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
        const { userId } = await authenticate(request);

        if (!(await checkAdminPrivileges(userId))) {
            return NextResponse.json({ error: "Access denied. Valid subscription or admin role required." }, { status: 403 });
        }

        await connectToDatabase();

        const { type, id, name, parentName, action, isActive, data } = await request.json();

        const settings = await getAppSettings();

        if (type === "delivery-type") {
            if (!id) {
                return NextResponse.json({ error: "ID is required" }, { status: 400 });
            }
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
            if (!id) {
                return NextResponse.json({ error: "ID is required" }, { status: 400 });
            }
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
            if (!name && !id) {
                return NextResponse.json({ error: "Name or ID is required" }, { status: 400 });
            }

            let category;
            if (id) {
                category = settings.additionalCategories.id(id);
            } else {
                category = (settings.additionalCategories || []).find(cat => cat.name === name);
            }

            if (!category) {
                return NextResponse.json(
                    { error: "Category not found" },
                    { status: 404 }
                );
            }

            if (action === "toggleActive" && typeof isActive !== "undefined") {
                category.isActive = isActive;
            } else if (data) {
                Object.assign(category, data);
            }

            await settings.save();

            return NextResponse.json({ message: "Category updated successfully" }, { status: 200 });

        } else if (type === "subcategory") {
            if (!parentName || !name) {
                return NextResponse.json({ error: "parentName and name are required" }, { status: 400 });
            }

            const parent = (settings.additionalCategories || []).find(cat => cat.name === parentName);
            if (!parent) {
                return NextResponse.json({ error: "Parent category not found" }, { status: 404 });
            }

            const subcategory = parent.subcategories.find(sc => sc.name === name);
            if (!subcategory) {
                return NextResponse.json({ error: "Subcategory not found" }, { status: 404 });
            }

            if (action === "toggleActive" && typeof isActive !== "undefined") {
                subcategory.isActive = isActive;
            } else if (data) {
                Object.assign(subcategory, data);
            }

            await settings.save();

            return NextResponse.json({ message: "Subcategory updated successfully" }, { status: 200 });

        } else {
            return NextResponse.json(
                { error: "Invalid type. Must be 'delivery-type', 'order-status', 'category', or 'subcategory'" },
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
        const { userId } = await authenticate(request);

        if (!(await checkAdminPrivileges(userId))) {
            return NextResponse.json({ error: "Access denied. Valid subscription or admin role required." }, { status: 403 });
        }

        await connectToDatabase();

        const body = await request.json();
        const { type, id, name, parentName } = body;

        if (!type) {
            return NextResponse.json(
                { error: "Type is required" },
                { status: 400 }
            );
        }

        const settings = await getAppSettings();

        if (type === "delivery-type") {
            if (!id) {
                return NextResponse.json({ error: "ID is required" }, { status: 400 });
            }
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
            if (!id) {
                return NextResponse.json({ error: "ID is required" }, { status: 400 });
            }
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
            if (!name && !id) {
                return NextResponse.json({ error: "Name or ID is required" }, { status: 400 });
            }

            let category;
            if (id) {
                category = settings.additionalCategories.id(id);
                if (!category) {
                    return NextResponse.json({ error: "Category not found" }, { status: 404 });
                }
                settings.additionalCategories.pull(id);
            } else {
                const catIndex = (settings.additionalCategories || []).findIndex(cat => cat.name === name);
                if (catIndex === -1) {
                    return NextResponse.json({ error: "Category not found" }, { status: 404 });
                }
                settings.additionalCategories.splice(catIndex, 1);
            }

            await settings.save();

            return NextResponse.json({ message: "Category deleted successfully" }, { status: 200 });

        } else if (type === "subcategory") {
            if (!parentName || !name) {
                return NextResponse.json({ error: "parentName and name are required" }, { status: 400 });
            }

            const parent = (settings.additionalCategories || []).find(cat => cat.name === parentName);
            if (!parent) {
                return NextResponse.json({ error: "Parent category not found" }, { status: 404 });
            }

            const subIndex = parent.subcategories.findIndex(sc => sc.name === name);
            if (subIndex === -1) {
                return NextResponse.json({ error: "Subcategory not found" }, { status: 404 });
            }

            parent.subcategories.splice(subIndex, 1);
            await settings.save();

            return NextResponse.json({ message: "Subcategory deleted successfully" }, { status: 200 });

        } else {
            return NextResponse.json(
                { error: "Invalid type. Must be 'delivery-type', 'order-status', 'category', or 'subcategory'" },
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