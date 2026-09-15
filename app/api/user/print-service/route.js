import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/db";
import CreatorPrintService from "@/models/CreatorPrintService";
import { requireCreator } from "@/lib/requireCreator";
import { validatePrintService, ownerPrintService } from "@/lib/creatorPrintService/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 12 materials x 20 colours + a 1500-char description fits well inside 16KB.
const MAX_BODY_BYTES = 16 * 1024;

// Owner read: the creator's own print service (defaults when none yet).
export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        await connectToDatabase();
        const doc = await CreatorPrintService.findOne({ creatorUserId: userId }).lean();
        return NextResponse.json({ service: ownerPrintService(doc) });
    } catch (error) {
        console.error("Error reading print service:", error);
        return NextResponse.json({ error: "Failed to read print service" }, { status: 500 });
    }
}

// Owner upsert: the whole service document is replaced by the validated body.
export async function PUT(req) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await requireCreator(userId))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const contentLength = Number(req.headers.get("content-length") || 0);
        if (contentLength > MAX_BODY_BYTES) {
            return NextResponse.json({ error: "Payload too large" }, { status: 413 });
        }

        let body;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const result = validatePrintService(body);
        if (!result.ok) {
            return NextResponse.json({ error: result.error, issues: result.issues }, { status: 400 });
        }

        await connectToDatabase();
        const updated = await CreatorPrintService.findOneAndUpdate(
            { creatorUserId: userId },
            { $set: result.value, $setOnInsert: { creatorUserId: userId } },
            { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
        ).lean();

        return NextResponse.json({ success: true, service: ownerPrintService(updated) });
    } catch (error) {
        console.error("Error updating print service:", error);
        return NextResponse.json({ error: "Failed to update print service" }, { status: 500 });
    }
}
