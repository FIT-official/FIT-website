import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { connectToDatabase } from "@/lib/db"
import CustomPrintRequest from "@/models/CustomPrintRequest"
import { s3 } from "@/lib/s3"
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { v4 as uuidv4 } from 'uuid'

const BUCKET_NAME = process.env.NEXT_PUBLIC_S3_BUCKET_NAME

export const runtime = "nodejs"

export async function POST(req) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        await connectToDatabase()

        const formData = await req.formData()
        const file = formData.get('file')
        const userEmail = formData.get('userEmail')
        const userName = formData.get('userName')

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 })
        }

        // Validate file type (3D model formats)
        const allowedExtensions = ['.stl', '.obj', '.glb', '.gltf', '.3mf', '.ply']
        const fileName = file.name.toLowerCase()
        const isValidFile = allowedExtensions.some(ext => fileName.endsWith(ext))

        if (!isValidFile) {
            return NextResponse.json({
                error: "Invalid file type. Please upload a 3D model file (.stl, .obj, .glb, .gltf, .3mf, .ply)"
            }, { status: 400 })
        }

        // Validate file size (max 50MB)
        const maxSize = 50 * 1024 * 1024 // 50MB
        if (file.size > maxSize) {
            return NextResponse.json({
                error: "File too large. Maximum size is 50MB"
            }, { status: 400 })
        }

        // Convert file to buffer
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)

        // Generate unique request ID and S3 key
        const requestId = `CPR-${Date.now()}-${uuidv4().substring(0, 8).toUpperCase()}`
        const s3Key = `custom-prints/${userId}/${requestId}/${file.name}`

        // Upload to S3
        await s3.send(
            new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: s3Key,
                Body: buffer,
                ContentType: file.type || "application/octet-stream",
                CacheControl: "public, max-age=31536000",
            })
        )

        const s3Url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`

        // Create custom print request
        const customPrintRequest = new CustomPrintRequest({
            requestId,
            userId,
            userEmail: userEmail || 'unknown@email.com',
            userName: userName || 'Unknown User',
            modelFile: {
                originalName: file.name,
                s3Key,
                s3Url: s3Key,
                fileSize: file.size,
                uploadedAt: new Date()
            },
            status: 'pending_config',
            basePrice: 15.00, // Base starting price in SGD
            currency: 'sgd',
            statusHistory: [{
                status: 'pending_config',
                updatedAt: new Date(),
                note: 'Model uploaded, awaiting configuration'
            }]
        })

        const savedRequest = await customPrintRequest.save()

        return NextResponse.json({
            success: true,
            requestId: savedRequest.requestId,
            modelUrl: s3Key, // Return just the key for proxy usage
            message: "Model uploaded successfully"
        }, { status: 201 })

    } catch (error) {
        console.error("Error uploading custom print model:", error)
        return NextResponse.json({
            error: error.message || "Failed to upload model"
        }, { status: 500 })
    }
}

export async function GET(req) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        await connectToDatabase()

        const { searchParams } = new URL(req.url)
        const requestId = searchParams.get('requestId')

        if (requestId) {
            // Get specific request
            const request = await CustomPrintRequest.findOne({ requestId, userId })
            if (!request) {
                return NextResponse.json({ error: "Request not found" }, { status: 404 })
            }
            return NextResponse.json({ request }, { status: 200 })
        }

        // Get all requests for user
        const requests = await CustomPrintRequest.find({ userId })
            .sort({ createdAt: -1 })
            .lean()

        return NextResponse.json({ requests }, { status: 200 })

    } catch (error) {
        console.error("Error fetching custom print requests:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
