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

    const filenames = [];

    for (const file of files) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
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
        return NextResponse.json({ error: "Could not compress image below 200KB" }, { status: 400 });
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
    return NextResponse.json({ error: error.message || "Image upload failed" }, { status: 500 });
  }
}