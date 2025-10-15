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

        // Get the specific print order
        const printOrder = await PrintOrder.findOne({
            _id: orderId,
            userId: userId // Ensure user can only access their own orders
        }).lean();

        if (!printOrder) {
            return NextResponse.json({ error: "Print order not found" }, { status: 404 });
        }

        return NextResponse.json(printOrder, { status: 200 });

    } catch (error) {
        console.error("Error fetching print order:", error);
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
        const updateData = await req.json();

        await connectToDatabase();

        // Find the order and ensure it belongs to the user
        const printOrder = await PrintOrder.findOne({
            _id: orderId,
            userId: userId
        });

        if (!printOrder) {
            return NextResponse.json({ error: "Print order not found" }, { status: 404 });
        }

        // Only allow updating configuration data and moving from pending_config to configured
        const allowedUpdates = ['configuration', 'status'];
        const updates = {};

        for (const key of allowedUpdates) {
            if (updateData[key] !== undefined) {
                updates[key] = updateData[key];
            }
        }

        // If updating configuration, automatically set status to configured
        if (updateData.configuration) {
            updates.status = 'configured';
            updates.configurationDate = new Date();
        }

        const updatedOrder = await PrintOrder.findByIdAndUpdate(
            orderId,
            updates,
            { new: true, runValidators: true }
        );

        return NextResponse.json(updatedOrder, { status: 200 });

    } catch (error) {
        console.error("Error updating print order:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}