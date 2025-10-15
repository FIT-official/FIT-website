import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

// Simple in-memory storage for print configurations
// In production, you might want to use a database or session storage
const configStore = new Map();

export async function GET(req) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const productId = searchParams.get('productId');
        const variantId = searchParams.get('variantId') || 'default';

        if (!productId) {
            return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
        }

        const configKey = `${userId}_${productId}_${variantId}`;
        const configuration = configStore.get(configKey) || null;

        return NextResponse.json({ configuration }, { status: 200 });

    } catch (error) {
        console.error("Error fetching print configuration:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { productId, variantId, configuration } = await req.json();

        if (!productId || !configuration) {
            return NextResponse.json({ error: "Product ID and configuration are required" }, { status: 400 });
        }

        const configKey = `${userId}_${productId}_${variantId || 'default'}`;
        configStore.set(configKey, {
            ...configuration,
            savedAt: new Date().toISOString(),
            productId,
            variantId: variantId || null,
        });

        return NextResponse.json({
            message: "Configuration saved successfully"
        }, { status: 200 });

    } catch (error) {
        console.error("Error saving print configuration:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function DELETE(req) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const productId = searchParams.get('productId');
        const variantId = searchParams.get('variantId') || 'default';

        if (!productId) {
            return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
        }

        const configKey = `${userId}_${productId}_${variantId}`;
        configStore.delete(configKey);

        return NextResponse.json({
            message: "Configuration deleted successfully"
        }, { status: 200 });

    } catch (error) {
        console.error("Error deleting print configuration:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}