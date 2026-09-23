import { NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/db"
import CustomPrintRequest from "@/models/CustomPrintRequest"
import { v4 as uuidv4 } from 'uuid'
import { authenticate, unauthorizedResponse, UnauthorizedError } from '@/lib/authenticate'
import { clerkClient } from "@clerk/nextjs/server"
import Product from '@/models/Product'
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'
import CreatorPrintService from '@/models/CreatorPrintService'
import { notifyCreatorNewRequest } from '@/lib/notifications/creatorPrint'
import { sanitizeString } from '@/utils/validate'
import { reserveCreatorQuota, CreatorQuotaError } from '@/lib/creatorQuota'
import { normalizeDesignSource } from '@/lib/printRequestDraft'
import { PrintConfigurationError, validatePrintConfiguration } from '@/lib/quoting/validatePrintConfiguration'

export const runtime = "nodejs"

const STATUS_RANK = {
    pending_upload: 0,
    pending_config: 1,
    configured: 2,
    quoted: 3,
    payment_pending: 4,
    paid: 5,
    printing: 6,
    printed: 7,
    shipped: 8,
    delivered: 9,
};

function computeMinimumStatusFromData(requestDoc) {
    const hasModel = !!(requestDoc?.modelFile?.s3Key && requestDoc?.modelFile?.originalName);
    const isConfigured = !!requestDoc?.printConfiguration?.isConfigured;
    if (isConfigured) return 'configured';
    if (hasModel) return 'pending_config';
    return 'pending_upload';
}

function maybeUpgradeStatusToMatchData(requestDoc, note) {
    const target = computeMinimumStatusFromData(requestDoc);
    const current = requestDoc?.status || 'pending_upload';
    const currentRank = STATUS_RANK[current];
    const targetRank = STATUS_RANK[target];
    if (currentRank == null || targetRank == null) return false;
    if (currentRank >= targetRank) return false;

    requestDoc.status = target;
    requestDoc.statusHistory = requestDoc.statusHistory || [];
    requestDoc.statusHistory.push({
        status: target,
        updatedAt: new Date(),
        note: note || 'Auto-reconciled status based on uploaded model/configuration',
    });
    return true;
}

const MAX_CUSTOMER_NOTE = 1000;

// Optional JSON body for POST. The legacy request page sent multipart with no
// fields the route read, so anything that is not JSON is treated as empty.
async function readOptionalJsonBody(req) {
    const contentType = req.headers?.get?.('content-type') || '';
    if (!/application\/json/i.test(contentType)) return {};
    try {
        const body = await req.json();
        return body && typeof body === 'object' ? body : {};
    } catch {
        return {};
    }
}

async function getCustomPrintBasePrice() {
    try {
        const product = await Product.findOne({ slug: 'custom-print-request' }).lean();
        const amount = Number(product?.basePrice?.presentmentAmount);
        return Number.isFinite(amount) ? amount : 0;
    } catch (e) {
        console.error('[custom-print] Failed to load custom print base price:', e);
        return 0;
    }
}

// POST: Create a blank custom print request (no model, no config, just user info).
// Optional JSON `{ creatorUserId }` routes the job to a creator's print service
// (must exist and be enabled, else 400); otherwise Fix It Today handles it.
export async function POST(req) {
    let reservation;
    let created = false;
    try {
        const { userId } = await authenticate(req);
        const body = await readOptionalJsonBody(req);
        let creatorUserId = null;
        if (body.creatorUserId != null && body.creatorUserId !== '') {
            if (typeof body.creatorUserId !== 'string' || body.creatorUserId.length > 64) {
                return NextResponse.json({ error: "Invalid creatorUserId" }, { status: 400 });
            }
            await connectToDatabase();
            const service = await CreatorPrintService.findOne({ creatorUserId: body.creatorUserId }, { enabled: 1 }).lean();
            if (!service?.enabled) {
                return NextResponse.json({ error: "This creator is not accepting print requests" }, { status: 400 });
            }
            creatorUserId = body.creatorUserId;
        }
        const client = await clerkClient();
        const userObj = await client.users.getUser(userId);
        const { emailAddresses, firstName, lastName } = userObj;
        const userEmail = (emailAddresses && emailAddresses.length > 0 && emailAddresses[0]?.emailAddress)
            ? emailAddresses[0].emailAddress
            : `${userId}@unknown.local`;
        const userName = [firstName, lastName].filter(Boolean).join(' ') || userObj?.username || 'Unknown';


                await connectToDatabase();
                // Get base price from custom print product
                // Creator jobs carry no platform base price: the creator's quote is the whole price.
                const basePrice = creatorUserId ? 0 : await getCustomPrintBasePrice();
                if (creatorUserId) reservation = await reserveCreatorQuota(creatorUserId, "monthlyPrintRequests");
                const requestId = uuidv4();
                const customPrintRequest = new CustomPrintRequest({
                        requestId,
                        userId,
                        userEmail: userEmail,
                        userName: userName,
                        status: 'pending_upload',
                        basePrice,
                        creatorUserId,
                        statusHistory: [{ status: 'pending_upload', note: creatorUserId ? 'Request created for a creator print service, awaiting model upload' : 'Request created, awaiting model upload', updatedAt: new Date() }],
                });
                await customPrintRequest.save();
                return NextResponse.json({ requestId, creatorUserId }, { status: 201 });


    } catch (error) {
        if (reservation && !created) await reservation.release().catch(console.error);
        if (error instanceof CreatorQuotaError) return NextResponse.json({ error: error.message }, { status: error.status });
        if (error instanceof UnauthorizedError) return unauthorizedResponse();
        console.error("[POST /api/custom-print] Error:", error);
        if (error && error.errors) {
            Object.entries(error.errors).forEach(([key, val]) => {
                console.error(`[POST /api/custom-print] Validation error for ${key}:`, val && val.message, val);
            });
        }
        if (error && error.stack) {
            console.error("[POST /api/custom-print] Stack trace:", error.stack);
        }
        return NextResponse.json({
            error: error.message || "Failed to handle custom print POST",
            details: error.errors || error
        }, { status: 500 });
    }
}

// DELETE: Customer deletes a print request and its S3 model
export async function DELETE(req) {
    try {
        const { userId } = await authenticate(req);
        const { searchParams } = new URL(req.url);
        const requestId = searchParams.get('requestId');
        if (!requestId) {
            return NextResponse.json({ error: "requestId is required" }, { status: 400 });
        }
        await connectToDatabase();
        const request = await CustomPrintRequest.findOne({ requestId, userId });
        if (!request) {
            return NextResponse.json({ error: "Request not found" }, { status: 404 });
        }
        // Delete S3 model if present
        if (request.modelFile?.s3Key?.startsWith(`models/${userId}/`)) {
            try {
                const s3 = new S3Client({ region: process.env.AWS_REGION, credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY } });
                await s3.send(new DeleteObjectCommand({
                    // NEXT_PUBLIC_S3_BUCKET_NAME is the canonical bucket var
                    // (AWS_S3_BUCKET was never defined in any env file).
                    Bucket: process.env.NEXT_PUBLIC_S3_BUCKET_NAME,
                    Key: request.modelFile.s3Key
                }));
            } catch (e) {
                console.error('[DELETE /api/custom-print] Failed to delete S3 model:', e);
            }
        }
        await CustomPrintRequest.deleteOne({ requestId, userId });
        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof UnauthorizedError) return unauthorizedResponse();
        console.error("[DELETE /api/custom-print] Error:", error);
        return NextResponse.json({ error: error.message || "Failed to delete print request" }, { status: 500 });
    }
}

export async function GET(req) {
    try {
        const { userId } = await authenticate(req);

        await connectToDatabase();

        const { searchParams } = new URL(req.url);
        const requestId = searchParams.get('requestId');

        if (requestId) {
            const request = await CustomPrintRequest.findOne({ requestId, userId });
            if (!request) {
                // If a cart references a requestId that doesn't exist yet, create an empty request.
                // Guard against obviously invalid IDs to avoid creating junk documents.
                const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                if (!uuidLike.test(requestId)) {
                    return NextResponse.json({ error: "Invalid requestId" }, { status: 400 });
                }

                let userEmail = `${userId}@unknown.local`;
                let userName = 'Unknown';
                try {
                    const client = await clerkClient();
                    const userObj = await client.users.getUser(userId);
                    const { emailAddresses, firstName, lastName } = userObj;
                    userEmail = (emailAddresses && emailAddresses.length > 0 && emailAddresses[0]?.emailAddress)
                        ? emailAddresses[0].emailAddress
                        : userEmail;
                    userName = [firstName, lastName].filter(Boolean).join(' ') || userObj?.username || userName;
                } catch (e) {
                    console.error('[GET /api/custom-print] Failed to fetch user info for auto-create:', e);
                }

                // Base price from custom print product (best-effort)
                const basePrice = await getCustomPrintBasePrice();

                const created = new CustomPrintRequest({
                    requestId,
                    userId,
                    userEmail,
                    userName,
                    status: 'pending_upload',
                    basePrice,
                    statusHistory: [{ status: 'pending_upload', note: 'Request auto-created on GET (cart reference)', updatedAt: new Date() }],
                });
                await created.save();
                return NextResponse.json({ request: created }, { status: 200 });
            }

            // Ensure status never lags behind the data we already have.
            const didUpgrade = maybeUpgradeStatusToMatchData(request);
            if (didUpgrade) {
                await request.save();
            }
            return NextResponse.json({ request }, { status: 200 });
        }

        const requests = await CustomPrintRequest.find({ userId })
            .sort({ createdAt: -1 })
            .lean();
        console.log(`[GET /api/custom-print] Returning all requests for userId ${userId}:`, requests);
        return NextResponse.json({ requests }, { status: 200 });

    } catch (error) {
        if (error instanceof UnauthorizedError) return unauthorizedResponse();
        console.error("[GET /api/custom-print] Error:", error);
        if (error && error.errors) {
            Object.entries(error.errors).forEach(([key, val]) => {
                console.error(`[GET /api/custom-print] Validation error for ${key}:`, val && val.message, val);
            });
        }
        if (error && error.stack) {
            console.error("[GET /api/custom-print] Stack trace:", error.stack);
        }
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

export async function PUT(req) {
    try {
        const { userId } = await authenticate(req);
        const body = await req.json();
        const { requestId, modelFile, printConfiguration, status, statusNote, pricing, customerNote, designSource } = body;
        if (!requestId) {
            return NextResponse.json({ error: "requestId is required" }, { status: 400 });
        }
        await connectToDatabase();
        let request = await CustomPrintRequest.findOne({ requestId, userId });
        const existingRequest = !!request;
        if (!request) {
            let userEmail = null;
            let userName = null;
            try {
                const client = await clerkClient();
                const userObj = await client.users.getUser(userId);
                const { emailAddresses, firstName, lastName } = userObj;
                userEmail = (emailAddresses && emailAddresses.length > 0 && emailAddresses[0]?.emailAddress)
                    ? emailAddresses[0].emailAddress
                    : `${userId}@unknown.local`;
                userName = [firstName, lastName].filter(Boolean).join(' ') || userObj?.username || 'Unknown';
            } catch (e) {
                console.error('[PUT /api/custom-print] Failed to fetch user info:', e);
            }
            request = new CustomPrintRequest({
                requestId,
                userId,
                userEmail,
                userName,
                status: 'pending_upload',
                basePrice: await getCustomPrintBasePrice(),
                statusHistory: [{ status: 'pending_upload', note: 'Request created via PUT, awaiting model upload', updatedAt: new Date() }],
            });
        }
        const originalStatus = request.status;
        // Mongoose merges document.$where into the actual update filter. A
        // concurrent quote, payment or model edit must make this save fail.
        if (existingRequest) request.$where = {
            status: originalStatus,
            ...(request.updatedAt ? { updatedAt: request.updatedAt } : {}),
        };
        const draftStatuses = ['pending_upload', 'pending_config', 'configured'];
        if (pricing || (status && !draftStatuses.includes(status))) {
            return NextResponse.json({ error: "Pricing and payment status are managed by the store" }, { status: 403 });
        }
        if (!draftStatuses.includes(originalStatus) && (modelFile || printConfiguration || status || designSource !== undefined)) {
            return NextResponse.json({ error: "Contact the store to change a request after it has been quoted" }, { status: 409 });
        }
        let explicitStatus = status;

        // Update fields
        if (modelFile) {
            const previousKey = request.modelFile?.s3Key;
            if (typeof modelFile.s3Key !== 'string' ||
                (modelFile.s3Key !== previousKey && !modelFile.s3Key.startsWith(`models/${userId}/`))) {
                return NextResponse.json({ error: "The model must belong to your account" }, { status: 400 });
            }
            request.modelFile = {
                originalName: modelFile.originalName,
                s3Key: modelFile.s3Key,
                s3Url: modelFile.s3Url,
                fileSize: modelFile.fileSize,
                uploadedAt: modelFile.uploadedAt ? new Date(modelFile.uploadedAt) : new Date()
            };
        }
        if (printConfiguration) {
            const configuration = validatePrintConfiguration(printConfiguration, {
                creator: !!request.creatorUserId, partial: !!request.creatorUserId,
            });
            request.printConfiguration = { ...configuration, configuredAt: new Date(), isConfigured: true };
            request.quote = undefined;
            request.quotedAt = undefined;
        }
        if (designSource !== undefined) {
            const normalizedSource = normalizeDesignSource(designSource);
            if (designSource !== null && !normalizedSource) {
                return NextResponse.json({ error: 'Enter a public HTTPS design source link' }, { status: 400 });
            }
            request.designSource = normalizedSource || undefined;
        }
        if (typeof customerNote === 'string') {
            request.customerNote = sanitizeString(customerNote).trim().slice(0, MAX_CUSTOMER_NOTE);
        }

        // If the caller provides a status, start there (but we will still enforce a minimum based on data).
        if (explicitStatus) {
            request.status = explicitStatus;
        }
        // Enforce that status is never "behind" the presence of model/config.
        const minStatus = computeMinimumStatusFromData(request);
        const currentRank = STATUS_RANK[request.status];
        const minRank = STATUS_RANK[minStatus];
        let finalStatus = request.status;
        let autoCorrected = false;
        if (currentRank != null && minRank != null && currentRank < minRank) {
            finalStatus = minStatus;
            request.status = finalStatus;
            autoCorrected = true;
        }

        // Record status history if status changed or if the caller asked to set a status.
        if (request.status !== originalStatus || explicitStatus) {
            request.statusHistory = request.statusHistory || [];
            const defaultNote =
                request.status === 'pending_config'
                    ? 'Model uploaded, awaiting configuration'
                    : request.status === 'configured'
                        ? 'Print configuration saved'
                        : undefined;
            request.statusHistory.push({
                status: request.status,
                updatedAt: new Date(),
                note: statusNote || (autoCorrected ? 'Auto-reconciled status based on uploaded model/configuration' : defaultNote),
            });
        }
        await request.save();

        // Creator-handled job just became ready for a quote: tell the creator.
        // Best-effort, never fails the customer's save.
        if (request.creatorUserId && request.status === 'configured' && originalStatus !== 'configured') {
            try {
                await notifyCreatorNewRequest({ request: request.toObject() });
            } catch (notifyErr) {
                console.error('[PUT /api/custom-print] creator notification failed:', notifyErr);
            }
        }

        // Delete any other empty requests for this user (no modelFile, no config, not this requestId)
        await CustomPrintRequest.deleteMany({
            userId,
            requestId: { $ne: requestId },
            $and: [
                {
                    $or: [
                        { modelFile: { $exists: false } },
                        { modelFile: null },
                        { 'modelFile.s3Key': { $exists: false } },
                        { 'modelFile.s3Key': null },
                    ],
                },
                {
                    $or: [
                        { printConfiguration: { $exists: false } },
                        { printConfiguration: null },
                        { 'printConfiguration.isConfigured': { $exists: false } },
                        { 'printConfiguration.isConfigured': false },
                    ],
                },
            ],
        });

        return NextResponse.json({ request }, { status: 200 });
    } catch (error) {
        if (error instanceof UnauthorizedError) return unauthorizedResponse();
        if (error instanceof PrintConfigurationError) return NextResponse.json({ error: error.message }, { status: 400 });
        if (error?.name === 'DocumentNotFoundError' || error?.name === 'VersionError') {
            return NextResponse.json({ error: 'This request changed. Reload it before saving.' }, { status: 409 });
        }
        console.error("[PUT /api/custom-print] Error:", error);
        if (error && error.errors) {
            Object.entries(error.errors).forEach(([key, val]) => {
                console.error(`[PUT /api/custom-print] Validation error for ${key}:`, val && val.message, val);
            });
        }
        if (error && error.stack) {
            console.error("[PUT /api/custom-print] Stack trace:", error.stack);
        }
        return NextResponse.json({ error: error.message || "Failed to handle custom print PUT", details: error.errors || error }, { status: 500 });
    }
}
