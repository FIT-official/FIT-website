import { NextResponse } from "next/server"
import { connectToDatabase } from "@/lib/db"
import CustomPrintRequest from "@/models/CustomPrintRequest"
import { v4 as uuidv4 } from 'uuid'
import { authenticate } from '@/lib/authenticate'
import { clerkClient } from "@clerk/nextjs/server"
import Product from '@/models/Product'
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'

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

// POST: Create a blank custom print request (no model, no config, just user info)
export async function POST(req) {
    try {
        const { userId } = await authenticate(req);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
                const basePrice = await getCustomPrintBasePrice();
                const requestId = uuidv4();
                const customPrintRequest = new CustomPrintRequest({
                        requestId,
                        userId,
                        userEmail: userEmail,
                        userName: userName,
                        status: 'pending_upload',
                        basePrice,
                        statusHistory: [{ status: 'pending_upload', note: 'Request created, awaiting model upload', updatedAt: new Date() }],
                });
                await customPrintRequest.save();
                return NextResponse.json({ requestId }, { status: 201 });


    } catch (error) {
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
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
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
        if (request.modelFile && request.modelFile.s3Key) {
            try {
                const s3 = new S3Client({ region: process.env.AWS_REGION, credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY } });
                await s3.send(new DeleteObjectCommand({
                    Bucket: process.env.AWS_S3_BUCKET,
                    Key: request.modelFile.s3Key
                }));
            } catch (e) {
                console.error('[DELETE /api/custom-print] Failed to delete S3 model:', e);
            }
        }
        await CustomPrintRequest.deleteOne({ requestId, userId });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[DELETE /api/custom-print] Error:", error);
        return NextResponse.json({ error: error.message || "Failed to delete print request" }, { status: 500 });
    }
}

export async function GET(req) {
    try {
        const { userId } = await authenticate(req);
        if (!userId) {
            console.log('[GET /api/custom-print] No userId found after authenticate');
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

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
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const body = await req.json();
        const { requestId, modelFile, printConfiguration, status, statusNote, pricing } = body;
        if (!requestId) {
            return NextResponse.json({ error: "requestId is required" }, { status: 400 });
        }
        await connectToDatabase();
        let request = await CustomPrintRequest.findOne({ requestId, userId });
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
        let explicitStatus = status;

        // Update fields
        if (modelFile) {
            request.modelFile = {
                originalName: modelFile.originalName,
                s3Key: modelFile.s3Key,
                s3Url: modelFile.s3Url,
                fileSize: modelFile.fileSize,
                uploadedAt: modelFile.uploadedAt ? new Date(modelFile.uploadedAt) : new Date()
            };
        }
        if (printConfiguration) request.printConfiguration = printConfiguration;

        // If the caller provides a status, start there (but we will still enforce a minimum based on data).
        if (explicitStatus) {
            request.status = explicitStatus;
        }
        if (pricing) {
            if (pricing.basePrice !== undefined) request.basePrice = pricing.basePrice;
            if (pricing.printFee !== undefined) request.printFee = pricing.printFee;
            if (pricing.deliveryFee !== undefined) request.deliveryFee = pricing.deliveryFee;
            if (pricing.totalAmount !== undefined) request.totalAmount = pricing.totalAmount;
            if (pricing.currency !== undefined) request.currency = pricing.currency;
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
