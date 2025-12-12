import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import CustomPrintRequest from '@/models/CustomPrintRequest'
import { authenticate } from '@/lib/authenticate'
import { deleteFromS3 } from '@/lib/s3'

export async function DELETE(request) {
    try {
        const { userId } = await authenticate(request)
        const { searchParams } = new URL(request.url)
        const requestId = searchParams.get('requestId')

        if (!requestId) {
            return NextResponse.json({ error: 'Request ID is required' }, { status: 400 })
        }

        await connectToDatabase()

        // Find the custom print request
        const customPrintRequest = await CustomPrintRequest.findOne({ requestId })

        if (!customPrintRequest) {
            return NextResponse.json({ error: 'Custom print request not found' }, { status: 404 })
        }

        // Verify ownership
        if (customPrintRequest.userId !== userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
        }

        // Delete file from S3
        if (customPrintRequest.modelFile?.s3Key) {
            try {
                await deleteFromS3(customPrintRequest.modelFile.s3Key)
            } catch (s3Error) {
                console.error('Error deleting from S3:', s3Error)
                // Continue with database deletion even if S3 fails
            }
        }

        // Delete the database record
        await CustomPrintRequest.deleteOne({ requestId })

        return NextResponse.json({
            success: true,
            message: 'Custom print request deleted successfully'
        })
    } catch (error) {
        console.error('Error deleting custom print request:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
