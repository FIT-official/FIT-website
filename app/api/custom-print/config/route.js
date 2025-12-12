import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import CustomPrintRequest from '@/models/CustomPrintRequest'

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

        // Update status to configured
        if (customPrintRequest.status === 'pending_config') {
            customPrintRequest.status = 'configured'
        }

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
