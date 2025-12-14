import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Event from "@/models/Event";

export async function GET() {
    try {
        await connectToDatabase();
        const now = new Date();

        const events = await Event.find({
            isActive: true,
            startDate: { $lte: now },
            endDate: { $gte: now },
        }).lean();

        return NextResponse.json({ events }, { status: 200 });
    } catch (error) {
        console.error("Error fetching active events:", error);
        return NextResponse.json({ error: "Failed to fetch active events" }, { status: 500 });
    }
}
