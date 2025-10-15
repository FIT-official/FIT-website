import { NextResponse } from "next/server";
import { s3 } from "@/lib/s3";
import sharp from "sharp";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@clerk/nextjs/server";

const BUCKET_NAME = process.env.NEXT_PUBLIC_S3_BUCKET_NAME;

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { userId } = await auth();
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const files = formData.getAll("files");

    if (!files.length) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    const filenames = [];

    for (const file of files) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        return NextResponse.json({
          error: `File "${file.name}" is not a valid image file. Please upload only image files.`
        }, { status: 400 });
      }

      // Validate file size before processing
      if (file.size > MAX_FILE_SIZE) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        return NextResponse.json({
          error: `File "${file.name}" is too large (${sizeMB}MB). Maximum file size is 5MB. Please compress your image or choose a smaller file.`
        }, { status: 400 });
      }

      const arrayBuffer = await file.arrayBuffer();
      let buffer = Buffer.from(arrayBuffer);
      let sharpInstance = sharp(buffer);
      if (file.type === "image/png") {
        sharpInstance = sharpInstance.flatten({ background: '#e6e6e6' });
      }


      let compressed = null;
      let quality = 80;
      for (; quality >= 30; quality -= 10) {
        compressed = await sharpInstance
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();
        if (compressed.length < 200 * 1024) break;
      }
      if (!compressed || compressed.length >= 200 * 1024) {
        const finalSizeKB = compressed ? (compressed.length / 1024).toFixed(1) : 'unknown';
        return NextResponse.json({
          error: `Unable to compress "${file.name}" to required size. Final size: ${finalSizeKB}KB (required: <200KB). Please use a smaller or simpler image.`
        }, { status: 400 });
      }

      const ext = "jpg";
      const filename = `images/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: filename,
          Body: compressed,
          ContentType: "image/jpeg",
          CacheControl: "public, max-age=31536000",
        })
      );

      filenames.push(filename);
    }

    return NextResponse.json({ files: filenames });
  } catch (error) {
    console.error("Image upload error:", error);
    return NextResponse.json({
      error: error.message || "Image upload failed. Please try again or contact support if the problem persists."
    }, { status: 500 });
  }
}