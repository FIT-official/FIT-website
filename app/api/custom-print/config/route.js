import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import CustomPrintRequest from '@/models/CustomPrintRequest'

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

export async function PUT(req) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        await connectToDatabase()

        const body = await req.json()
        const { requestId, printSettings, meshColors } = body

        if (!requestId) {
            return NextResponse.json({ error: 'Request ID is required' }, { status: 400 })
        }

        // Find the custom print request
        const customPrintRequest = await CustomPrintRequest.findOne({
            requestId,
            userId
        })

        if (!customPrintRequest) {
            return NextResponse.json({ error: 'Custom print request not found' }, { status: 404 })
        }

        // Update print configuration
        customPrintRequest.printConfiguration = {
            meshColors: meshColors || {},
            printSettings: {
                layerHeight: printSettings.layerHeight,
                initialLayerHeight: printSettings.initialLayerHeight,
                materialType: printSettings.materialType,
                wallLoops: printSettings.wallLoops,
                internalSolidInfillPattern: printSettings.internalSolidInfillPattern,
                sparseInfillDensity: printSettings.sparseInfillDensity,
                sparseInfillPattern: printSettings.sparseInfillPattern,
                nozzleDiameter: printSettings.nozzleDiameter,
                enableSupport: printSettings.enableSupport,
                supportType: printSettings.supportType,
                printPlate: printSettings.printPlate
            },
            configuredAt: new Date(),
            isConfigured: true
        }

        // Ensure status never lags behind stored data (e.g. pending_upload -> configured)
        maybeUpgradeStatusToMatchData(customPrintRequest, 'Print configuration saved');

        await customPrintRequest.save()

        return NextResponse.json({
            success: true,
            message: 'Configuration saved successfully',
            request: customPrintRequest
        })

    } catch (error) {
        console.error('Error saving print configuration:', error)
        return NextResponse.json({
            error: 'Failed to save configuration',
            details: error.message
        }, { status: 500 })
    }
}
