import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const BUCKET_NAME = process.env.NEXT_PUBLIC_S3_BUCKET_NAME;

// Server-side helper to upload base64-encoded images (data URLs) to S3.
// Used by the reviews API, which sends mediaFiles as base64 strings.
export async function uploadImages(mediaFiles, prefix = "reviews") {
    if (!Array.isArray(mediaFiles) || mediaFiles.length === 0) {
        return [];
    }

    const uploadedUrls = [];

    for (const media of mediaFiles) {
        if (typeof media !== "string" || !media.startsWith("data:")) {
            // Skip invalid entries instead of failing the whole request
            continue;
        }

        const [meta, base64Data] = media.split(",");
        if (!base64Data) {
            continue;
        }

        const match = meta.match(/^data:(.*?);base64$/);
        const contentType = match?.[1] || "application/octet-stream";
        const extension = contentType.split("/")[1] || "bin";

        const key = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
        const buffer = Buffer.from(base64Data, "base64");

        await s3.send(
            new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: key,
                Body: buffer,
                ContentType: contentType,
                CacheControl: "public, max-age=31536000",
            })
        );

        const url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
        uploadedUrls.push(url);
    }

    return uploadedUrls;
}

// Delete a single object from S3 by key.
export async function deleteFromS3(key) {
    if (!key) return;

    await s3.send(
        new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
        })
    );
}