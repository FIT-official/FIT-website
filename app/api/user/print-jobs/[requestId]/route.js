import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/db";
import CustomPrintRequest from "@/models/CustomPrintRequest";
import { requireCreator } from "@/lib/requireCreator";
import { resolveCreatorJobTransition } from "@/lib/creatorPrintService/jobTransitions";
import { notifyCustomerCreatorQuote } from "@/lib/notifications/creatorPrint";
import { sanitizeString } from "@/utils/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_NOTE = 500;
const MAX_AMOUNT = 100000;

const cleanNote = (v) => (typeof v === "string" ? sanitizeString(v).trim().slice(0, MAX_NOTE) : "");

const HISTORY_NOTES = {
    accept: "Job accepted by the creator; payment arranged directly.",
    printing: "Printing started.",
    ready: "Print finished and ready for handover.",
    completed: "Job completed.",
};

// Creator: act on one of my print jobs.
// Body: { action: 'quote'|'accept'|'printing'|'ready'|'completed'|'reject',
//         amount?: number (quote), note?: string (quote), reason?: string (reject) }
export async function PATCH(req, props) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await requireCreator(userId))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const params = await props.params;
        const requestId = typeof params?.requestId === "string" ? params.requestId : "";
        if (!requestId || requestId.length > 64) {
            return NextResponse.json({ error: "requestId is required" }, { status: 400 });
        }

        let body;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const action = typeof body?.action === "string" ? body.action : "";

        await connectToDatabase();
        // Ownership is part of the query: another creator's job reads as 404.
        const doc = await CustomPrintRequest.findOne({ requestId, creatorUserId: userId });
        if (!doc) return NextResponse.json({ error: "Job not found" }, { status: 404 });

        const transition = resolveCreatorJobTransition(action, doc.status);
        if (!transition.ok) {
            return NextResponse.json({ error: transition.error }, { status: 400 });
        }

        let quoteAmount = null;
        let quoteNote = "";
        if (action === "quote") {
            const amount = Number(body?.amount);
            if (!Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) {
                return NextResponse.json({ error: "amount must be a number between 0 and 100000" }, { status: 400 });
            }
            quoteAmount = Math.round(amount * 100) / 100;
            quoteNote = cleanNote(body?.note);
            // Creator quotes are the whole price: no platform base price.
            doc.basePrice = 0;
            doc.printFee = quoteAmount;
            doc.currency = doc.currency || "sgd";
            doc.quoteMode = "manual";
            doc.quotedAt = new Date();
            if (quoteNote) doc.adminNote = quoteNote;
            doc.statusHistory.push({
                status: transition.status,
                note: quoteNote ? `Quote sent: ${quoteNote}` : "Quote sent by the creator.",
            });
        } else if (action === "reject") {
            const reason = cleanNote(body?.reason);
            if (!reason) return NextResponse.json({ error: "A reason is required to reject a job" }, { status: 400 });
            doc.statusHistory.push({ status: transition.status, note: `Declined by the creator: ${reason}` });
        } else {
            doc.statusHistory.push({ status: transition.status, note: HISTORY_NOTES[action] });
        }
        doc.status = transition.status;
        await doc.save();

        // Customer notification on quote — best effort, never fails the action.
        if (action === "quote") {
            try {
                await notifyCustomerCreatorQuote({ request: doc.toObject(), amount: quoteAmount, note: quoteNote });
            } catch (notifyErr) {
                console.error("[PATCH /api/user/print-jobs] notification failed:", notifyErr);
            }
        }

        // TODO(phase5-connect): when Stripe Connect lands, 'quote' should create a
        // payable checkout for the customer instead of an off-platform arrangement.
        const obj = doc.toObject();
        return NextResponse.json({
            success: true,
            job: {
                requestId: obj.requestId,
                status: obj.status,
                basePrice: obj.basePrice,
                printFee: obj.printFee,
                currency: obj.currency,
                adminNote: obj.adminNote,
                statusHistory: obj.statusHistory,
                updatedAt: obj.updatedAt,
            },
        });
    } catch (error) {
        console.error("Error updating creator print job:", error);
        return NextResponse.json({ error: "Failed to update print job" }, { status: 500 });
    }
}
