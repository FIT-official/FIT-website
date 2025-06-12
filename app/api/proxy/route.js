import { NextResponse } from "next/server";
import { s3 } from "@/lib/s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");
    if (!key) return new NextResponse("Missing key", { status: 400 });

    try {
        const command = new GetObjectCommand({
            Bucket: process.env.NEXT_PUBLIC_S3_BUCKET_NAME,
            Key: key,
        });
        const s3Response = await s3.send(command);

        // Read the stream into a buffer
        const chunks = [];
        for await (const chunk of s3Response.Body) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        return new NextResponse(buffer, {
            headers: {
                "Content-Type": s3Response.ContentType || "application/octet-stream",
                "Content-Length": s3Response.ContentLength?.toString() || undefined,
                "Cache-Control": "public, max-age=3600",
            },
        });
    } catch (err) {
        return new NextResponse("Not found", { status: 404 });
    }
}