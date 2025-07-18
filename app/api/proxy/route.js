import { NextResponse } from "next/server";
import { s3 } from "@/lib/s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@clerk/nextjs/server";

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");
    const download = searchParams.get("download");

    if (!key) return new NextResponse("Missing key", { status: 400 });

    if (download) {
        const { userId } = await auth();
        if (!userId) return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        const command = new GetObjectCommand({
            Bucket: process.env.NEXT_PUBLIC_S3_BUCKET_NAME,
            Key: key,
        });
        const s3Response = await s3.send(command);

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
                "Content-Disposition": `attachment; filename="${key.split('/').pop()}"`
            },
        });
    } catch (err) {
        return new NextResponse("Not found", { status: 404 });
    }
}