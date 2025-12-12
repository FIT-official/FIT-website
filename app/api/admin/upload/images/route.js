import { NextResponse } from "next/server";
import { s3 } from "@/lib/s3";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { checkAdminPrivileges } from "@/lib/checkPrivileges";
import { authenticate } from "@/lib/authenticate";

const BUCKET_NAME = process.env.NEXT_PUBLIC_S3_BUCKET_NAME;

export const runtime = "nodejs";

function sanitizeUploadPath(uploadPath) {
    if (!uploadPath) return null;
    // Allow letters, numbers, -, _, and / ; remove any leading/trailing slashes
    const cleaned = String(uploadPath).replace(/^\/+|\/+$/g, "");
    if (!/^[a-zA-Z0-9_\-/]+$/.test(cleaned)) return null;
    // Prevent traversal segments
    if (cleaned.includes("..")) return null;
    return cleaned;
}

function sanitizeS3Key(key) {
    if (!key) return null;
    const str = String(key);
    // reject URLs or absolute paths
    if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('/')) return null;
    if (str.includes('..')) return null;
    // allow letters, numbers, underscore, dash, slash and dot
    if (!/^[a-zA-Z0-9_\-/.]+$/.test(str)) return null;
    return str;
}

export async function POST(req) {
    try {
        // Try to load sharp for compression; if unavailable, fall back to raw upload
        let sharp = null;
        try {
            // Dynamic import of sharp to avoid build-time or platform-specific errors
            sharp = (await import("sharp")).default;
        } catch (err) {
            console.warn("sharp not available for admin uploads, skipping compression:", err?.message || err);
        }

        const { userId } = await authenticate(req);
        const isAdmin = await checkAdminPrivileges(userId);
        if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        const formData = await req.formData();

        const deleteKeyRaw = formData.get('deleteKey');
        if ((!formData.getAll('files') || formData.getAll('files').length === 0) && deleteKeyRaw) {
            const keyToDelete = sanitizeS3Key(deleteKeyRaw);
            if (!keyToDelete) {
                return NextResponse.json({ error: 'Invalid delete key' }, { status: 400 });
            }
            try {
                await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: keyToDelete }));
                return NextResponse.json({ deleted: [keyToDelete] });
            } catch (err) {
                console.error('Failed to delete object:', err);
                return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
            }
        }

        let files = formData.getAll("files") || [];
        const single = formData.get("file");
        if ((!files || files.length === 0) && single) files = [single];

        if (!files || files.length === 0) {
            return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
        }

        const uploadPathRaw = formData.get("uploadPath") || "";
        const uploadPathClean = sanitizeUploadPath(uploadPathRaw) || "misc";

        // Build S3 prefix for admin uploads to keep them separate from product images
        const prefix = `admin/uploads/${uploadPathClean}`;

        const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
        const filenames = [];

        for (const file of files) {
            if (!file || typeof file.arrayBuffer !== "function") continue;

            if (!file.type.startsWith("image/")) {
                return NextResponse.json({ error: `File "${file.name}" is not a valid image file. Please upload only image files.` }, { status: 400 });
            }

            if (file.size > MAX_FILE_SIZE) {
                const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
                return NextResponse.json({ error: `File "${file.name}" is too large (${sizeMB}MB). Maximum file size is 5MB.` }, { status: 400 });
            }

            const arrayBuffer = await file.arrayBuffer();
            const originalBuffer = Buffer.from(arrayBuffer);

            let bodyBuffer = originalBuffer;
            let contentType = file.type || "image/jpeg";

            if (sharp) {
                let sharpInstance = sharp(originalBuffer);
                if (file.type === "image/png") {
                    sharpInstance = sharpInstance.flatten({ background: "#ffffff" });
                }

                // compress to jpeg and aim < 200KB using decreasing quality
                let compressed = null;
                let quality = 80;
                for (; quality >= 30; quality -= 10) {
                    compressed = await sharpInstance.jpeg({ quality, mozjpeg: true }).toBuffer();
                    if (compressed.length < 200 * 1024) break;
                }

                if (compressed && compressed.length < 200 * 1024) {
                    bodyBuffer = compressed;
                    contentType = "image/jpeg";
                } else {
                    console.warn(
                        `sharp compression skipped for admin file "${file.name}"; using original buffer (size: ${
                            compressed ? (compressed.length / 1024).toFixed(1) : "unknown"
                        }KB)`
                    );
                }
            }

            const ext = contentType === "image/png" ? "png" : "jpg";
            const filename = `${prefix}/${Date.now()}-${Math.random()
                .toString(36)
                .slice(2)}.${ext}`;

            await s3.send(new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: filename,
                Body: bodyBuffer,
                ContentType: contentType,
                CacheControl: 'public, max-age=31536000'
            }));

            filenames.push(filename);
        }

        // If caller provided an existingKey, attempt to delete it now that we have successfully uploaded the new file(s)
        const existingKeyRaw = formData.get('existingKey') || formData.get('existing_key') || formData.get('previousKey');
        const existingKey = sanitizeS3Key(existingKeyRaw);
        if (existingKey) {
            try {
                // only delete if it doesn't match any of the newly uploaded filenames
                const shouldDelete = !filenames.includes(existingKey);
                if (shouldDelete) {
                    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: existingKey }));
                }
            } catch (err) {
                console.error('Failed to delete previous key after upload:', err);
                // non-fatal: proceed to return uploaded filenames
            }
        }

        return NextResponse.json({ files: filenames });
    } catch (error) {
        console.error('Admin image upload error:', error);
        return NextResponse.json({ error: error.message || 'Admin image upload failed' }, { status: 500 });
    }
}
