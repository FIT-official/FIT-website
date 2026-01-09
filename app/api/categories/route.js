import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import AppSettings from "@/models/AppSettings";

export async function GET(request) {
    try {
        await connectToDatabase();

        function getAppSettingsId() {
            return process.env.NODE_ENV === 'development' ? 'app-settings-dev' : 'app-settings';
        }
        let settings = await AppSettings.findById(getAppSettingsId());
        if (!settings) {
            settings = new AppSettings({
                _id: getAppSettingsId(),
                additionalDeliveryTypes: [],
                additionalOrderStatuses: [],
                additionalCategories: []
            });
            await settings.save();
        }

        const categories = (settings.additionalCategories || []).map(cat => ({
            name: cat.name,
            displayName: cat.displayName,
            type: cat.type,
            order: cat.order,
            isActive: cat.isActive,
            subcategories: (cat.subcategories || []).map(sub => ({
                name: sub.name,
                displayName: sub.displayName,
                isActive: sub.isActive
            }))
        }));

        return NextResponse.json({
            categories
        }, { status: 200 });
    } catch (error) {
        console.error("Error fetching categories:", error);
        return NextResponse.json(
            { error: "Failed to fetch categories" },
            { status: 500 }
        );
    }
}
