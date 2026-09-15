import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/db";
import CustomPrintRequest from "@/models/CustomPrintRequest";
import { requireCreator } from "@/lib/requireCreator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Creator: every print request routed to my print service, newest first.
// Only the fields the /dashboard/print-jobs list and drawer render are
// projected — never the customer's shipping address or payment ids.
const JOB_PROJECTION = {
    _id: 0,
    requestId: 1,
    userId: 1,
    userEmail: 1,
    userName: 1,
    status: 1,
    modelFile: 1,
    printConfiguration: 1,
    customerNote: 1,
    adminNote: 1,
    basePrice: 1,
    printFee: 1,
    currency: 1,
    statusHistory: 1,
    createdAt: 1,
    updatedAt: 1,
};

export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await requireCreator(userId))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await connectToDatabase();
        const jobs = await CustomPrintRequest.find({ creatorUserId: userId }, JOB_PROJECTION)
            .sort({ createdAt: -1 })
            .lean();
        return NextResponse.json({ jobs });
    } catch (error) {
        console.error("Error listing creator print jobs:", error);
        return NextResponse.json({ error: "Failed to load print jobs" }, { status: 500 });
    }
}
