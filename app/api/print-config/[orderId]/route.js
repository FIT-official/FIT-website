import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/db";
import PrintOrder from "@/models/PrintOrder";

export async function GET(req, { params }) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { orderId } = params;

        await connectToDatabase();

        // Get the specific print order configuration
        const printOrder = await PrintOrder.findOne({
            _id: orderId,
            userId: userId
        }).select('configuration').lean();

        if (!printOrder) {
            return NextResponse.json({ error: "Print order not found" }, { status: 404 });
        }

        return NextResponse.json({
            configuration: printOrder.configuration || null
        }, { status: 200 });

    } catch (error) {
        console.error("Error fetching print configuration:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function PUT(req, { params }) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { orderId } = params;
        const { configuration } = await req.json();

        if (!configuration) {
            return NextResponse.json({ error: "Configuration data is required" }, { status: 400 });
        }

        await connectToDatabase();

        // Find the order and ensure it belongs to the user
        const printOrder = await PrintOrder.findOne({
            _id: orderId,
            userId: userId
        });

        if (!printOrder) {
            return NextResponse.json({ error: "Print order not found" }, { status: 404 });
        }

        // Update the configuration
        const updatedOrder = await PrintOrder.findByIdAndUpdate(
            orderId,
            {
                configuration: configuration,
                status: 'configured',
                configurationDate: new Date()
            },
            { new: true, runValidators: true }
        );

        return NextResponse.json({
            message: "Configuration saved successfully",
            configuration: updatedOrder.configuration
        }, { status: 200 });

    } catch (error) {
        console.error("Error saving print configuration:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}