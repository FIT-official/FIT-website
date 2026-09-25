import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/db";
import CreatorPrintService from "@/models/CreatorPrintService";
import { requireCreator } from "@/lib/requireCreator";
import { validatePrintService, ownerPrintService } from "@/lib/creatorPrintService/validate";
import { loadRecommendedPricing } from "@/lib/quoting/loadFarmProfile";
import { recommendedPricingPayload } from "@/lib/quoting/farmProfile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 12 materials x 20 colours + a 1500-char description fits well inside 16KB.
const MAX_BODY_BYTES = 24 * 1024; // + per-farm pricing (6 materials, 6 delivery options)

// Fix It Today's recommended values, shown beside the creator's own and used
// by the dashboard to resolve its draft pricing for the live sample.
async function recommendedPayload() {
    const recommended = await loadRecommendedPricing();
    return recommendedPricingPayload(recommended);
}

// Owner read: the creator's own print service (defaults when none yet).
export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        await connectToDatabase();
        const doc = await CreatorPrintService.findOne({ creatorUserId: userId }).lean();
        return NextResponse.json({ service: ownerPrintService(doc), recommended: await recommendedPayload() });
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

        await connectToDatabase();
        const existing = await CreatorPrintService.findOne({ creatorUserId: userId }).lean();
        const result = validatePrintService(body, { existingPricing: existing?.pricing || null });
        if (!result.ok) {
            return NextResponse.json({ error: result.error, issues: result.issues }, { status: 400 });
        }

        // Pricing is written field by field so its version can be bumped in the
        // same update; a body without `pricing` leaves the stored one alone.
        const { pricing, ...fields } = result.value;
        const update = { $set: { ...fields }, $setOnInsert: { creatorUserId: userId } };
        if (pricing) {
            update.$set["pricing.overrides"] = pricing.overrides;
            update.$set["pricing.materials"] = pricing.materials;
            update.$set["pricing.delivery"] = pricing.delivery;
            update.$inc = { "pricing.version": 1 };
        }
        const updated = await CreatorPrintService.findOneAndUpdate(
            { creatorUserId: userId },
            update,
            { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
        ).lean();

        return NextResponse.json({ success: true, service: ownerPrintService(updated), recommended: await recommendedPayload() });
    } catch (error) {
        console.error("Error updating print service:", error);
        return NextResponse.json({ error: "Failed to update print service" }, { status: 500 });
    }
}
