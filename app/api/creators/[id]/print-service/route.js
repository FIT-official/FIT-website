import { NextResponse } from "next/server";
import CreatorPrintService from "@/models/CreatorPrintService";
import { resolveCreatorByIdOrName } from "@/lib/creatorPage/resolveCreator";
import { publicPrintService } from "@/lib/creatorPrintService/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public: a creator's advertised print service. `[id]` is a userId or a
// display name (same resolution as /creators/[id]). Missing creator or a
// disabled/absent service both answer `{ enabled: false }` so the client
// never learns which.
export async function GET(_req, props) {
    try {
        const params = await props.params;
        const creator = await resolveCreatorByIdOrName(params?.id);
        if (!creator) return NextResponse.json({ enabled: false });

        // resolveCreatorByIdOrName already connected to the database.
        const doc = await CreatorPrintService.findOne({ creatorUserId: creator.userId }).lean();
        const service = publicPrintService(doc);
        if (!service) return NextResponse.json({ enabled: false });

        return NextResponse.json({
            enabled: true,
            creator: { userId: creator.userId, displayName: creator.displayName },
            service,
        });
    } catch (error) {
        console.error("Error reading creator print service:", error);
        return NextResponse.json({ error: "Failed to read print service" }, { status: 500 });
    }
}
