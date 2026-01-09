import { NextResponse } from "next/server";
import { s3 } from "@/lib/s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@clerk/nextjs/server";
import { sanitizeString } from "@/utils/validate";
import { Readable } from "stream";

export const runtime = 'nodejs'

function toWebStream(body) {
    // AWS SDK v3 returns different body types depending on runtime.
    // In Node it is usually a Readable stream; in edge/browser it can be a ReadableStream.
    if (!body) return null;
    if (typeof body.getReader === 'function') return body; // already a Web ReadableStream
    if (typeof body.transformToWebStream === 'function') return body.transformToWebStream();
    // Node.js Readable -> Web ReadableStream
    return Readable.toWeb(body);
}

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    let key = searchParams.get("key");
    if (key) key = decodeURIComponent(key);
    key = sanitizeString(key);
    const download = searchParams.get("download");

    if (!key || key.includes("..") || key.startsWith("http") || !key.trim()) {
        return new NextResponse("Missing or invalid key", { status: 400 });
    }

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

        const bodyStream = toWebStream(s3Response.Body);
        if (!bodyStream) {
            return new NextResponse("Not found", { status: 404 });
        }

        const filename = key.split('/').pop();
        const headers = {
            "Content-Type": s3Response.ContentType || "application/octet-stream",
            "Content-Length": s3Response.ContentLength?.toString() || undefined,
            "Cache-Control": "public, max-age=3600",
        };
        // Only force download when explicitly requested.
        if (download) {
            headers["Content-Disposition"] = `attachment; filename="${filename}"`;
        }

        return new NextResponse(bodyStream, {
            headers: {
                ...headers,
            },
        });
    } catch (err) {
        // Only log essential error info
        // eslint-disable-next-line no-console
        console.error('Proxy fetch error:', {
            key,
            bucket: process.env.NEXT_PUBLIC_S3_BUCKET_NAME,
            code: err?.Code || err?.code,
            message: err?.message || err?.toString?.()
        });
        return new NextResponse("Not found", { status: 404 });
    }
}

export async function HEAD(req) {
    const { searchParams } = new URL(req.url);
    let key = searchParams.get("key");
    if (key) key = decodeURIComponent(key);
    key = sanitizeString(key);
    const download = searchParams.get("download");

    if (!key || key.includes("..") || key.startsWith("http") || !key.trim()) {
        return new NextResponse(null, { status: 400 });
    }

    if (download) {
        const { userId } = await auth();
        if (!userId) return new NextResponse(null, { status: 401 });
    }

    try {
        const command = new GetObjectCommand({
            Bucket: process.env.NEXT_PUBLIC_S3_BUCKET_NAME,
            Key: key,
        });
        const s3Response = await s3.send(command);

        const filename = key.split('/').pop();
        const headers = {
            "Content-Type": s3Response.ContentType || "application/octet-stream",
            "Content-Length": s3Response.ContentLength?.toString() || undefined,
            "Cache-Control": "public, max-age=3600",
        };
        if (download) {
            headers["Content-Disposition"] = `attachment; filename="${filename}"`;
        }

        return new NextResponse(null, { status: 200, headers });
    } catch (err) {
        return new NextResponse(null, { status: 404 });
    }
}