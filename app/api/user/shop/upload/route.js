import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { requireCreator } from "@/lib/requireCreator";
import { s3 } from "@/lib/s3";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const BUCKET_NAME = process.env.NEXT_PUBLIC_S3_BUCKET_NAME;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Creator-scoped image upload for shop banner/logo/gallery. Same S3 pipeline
// as the admin images route (sharp compression when available) but auth-only
// (no admin) and keys are always pinned under shops/<userId>/ so a caller can
// only ever write — and delete — inside their own prefix. `gallery` uploads
// never delete a previous object (a gallery block holds up to 8 keys; the cap
// is enforced when the page is saved).
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_BODY_BYTES = 6 * 1024 * 1024; // multipart overhead headroom
const KINDS = new Set(["banner", "logo", "gallery"]);

export async function POST(req) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (!(await requireCreator(userId))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const contentLength = Number(req.headers.get("content-length") || 0);
        if (contentLength > MAX_BODY_BYTES) {
            return NextResponse.json({ error: "Payload too large" }, { status: 413 });
        }

        let sharp = null;
        try {
            sharp = (await import("sharp")).default;
        } catch (err) {
            console.warn("sharp not available for shop uploads, skipping compression:", err?.message || err);
        }

        const formData = await req.formData();
        const file = formData.get("file");
        const kindRaw = String(formData.get("kind") || "banner");
        const kind = KINDS.has(kindRaw) ? kindRaw : null;

        if (!kind) {
            return NextResponse.json({ error: "kind must be banner, logo or gallery" }, { status: 400 });
        }
        if (!file || typeof file.arrayBuffer !== "function") {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }
        if (!file.type?.startsWith("image/")) {
            return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
        }
        if (file.size > MAX_FILE_SIZE) {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
            return NextResponse.json(
                { error: `Image is too large (${sizeMB}MB). Maximum file size is 5MB.` },
                { status: 400 }
            );
        }

        const originalBuffer = Buffer.from(await file.arrayBuffer());
        let bodyBuffer = originalBuffer;
        let contentType = file.type || "image/jpeg";

        if (sharp) {
            let sharpInstance = sharp(originalBuffer);
            if (file.type === "image/png") {
                sharpInstance = sharpInstance.flatten({ background: "#ffffff" });
            }
            let compressed = null;
            for (let quality = 80; quality >= 30; quality -= 10) {
                compressed = await sharpInstance.jpeg({ quality, mozjpeg: true }).toBuffer();
                if (compressed.length < 300 * 1024) break;
            }
            if (compressed && compressed.length < 300 * 1024) {
                bodyBuffer = compressed;
                contentType = "image/jpeg";
            }
        }

        const ext = contentType === "image/png" ? "png" : "jpg";
        const prefix = `shops/${userId}`;
        const key = `${prefix}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        await s3.send(
            new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: key,
                Body: bodyBuffer,
                ContentType: contentType,
                CacheControl: "public, max-age=31536000",
            })
        );

        // Replace flow: delete the previous image, but only within the caller's
        // own prefix (never an arbitrary bucket key).
        const existingKeyRaw = kind === "gallery" ? null : formData.get("existingKey");
        if (typeof existingKeyRaw === "string" && existingKeyRaw) {
            const existingKey = existingKeyRaw;
            const safe =
                existingKey.startsWith(`${prefix}/`) &&
                !existingKey.includes("..") &&
                /^[a-zA-Z0-9_\-/.]+$/.test(existingKey) &&
                existingKey !== key;
            if (safe) {
                try {
                    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: existingKey }));
                } catch (err) {
                    console.error("Failed to delete previous shop image:", err);
                    // non-fatal
                }
            }
        }

        return NextResponse.json({ key });
    } catch (error) {
        console.error("Shop image upload error:", error);
        return NextResponse.json({ error: "Shop image upload failed" }, { status: 500 });
    }
}
