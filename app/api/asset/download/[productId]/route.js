import { NextResponse } from "next/server";
import { s3 } from "@/lib/s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/db";
import DigitalProductTransaction from "@/models/DigitalProductTransaction";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function isValidIdx(idx, links) {
    const i = Number(idx);
    return Number.isInteger(i) && i >= 0 && i < links.length;
}

export async function GET(req, { params }) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const awaitedParams = await params;
    const productId = awaitedParams.productId;
    if (!productId) return NextResponse.json({ error: "Invalid Product ID" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const idx = searchParams.get("idx");

    try {
        await connectToDatabase();
        const transaction = await DigitalProductTransaction.findOne({ userId, productId });

        if (!transaction) return NextResponse.json({ error: "Invalid user or product ID" }, { status: 404 });

        if (!isValidIdx(idx, transaction.assets)) {
            return NextResponse.json({ error: "Invalid asset index" }, { status: 400 });
        }

        const key = transaction.assets[Number(idx)];
        if (!key) {
            return NextResponse.json({ error: "Asset not found" }, { status: 404 });
        }

        const command = new GetObjectCommand({
            Bucket: process.env.NEXT_PUBLIC_S3_BUCKET_NAME,
            Key: key,
        });

        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 15 });
        return NextResponse.json({ downloadUrl: signedUrl }, { status: 200 });
    } catch (error) {
        console.error("Error generating signed URL:", error);
        return NextResponse.json({ error: "Failed to generate download URL" }, { status: 500 });
    }
}