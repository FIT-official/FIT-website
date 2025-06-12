import { NextResponse } from "next/server";
import { s3 } from "@/lib/s3";
import sharp from "sharp";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@clerk/nextjs/server";
import { isValidUrl } from "@/utils/validate";

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

    const urls = [];

    for (const file of files) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
      }

      const arrayBuffer = await file.arrayBuffer();
      let buffer = Buffer.from(arrayBuffer);

      let compressed = null;
      let quality = 80;
      for (; quality >= 30; quality -= 10) {
        compressed = await sharp(buffer)
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

      const publicUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${filename}`;
      urls.push(publicUrl);
    }

    return NextResponse.json({ urls });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Image upload failed" }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const { userId } = await auth();
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { url } = await req.json();
    if (!url || !isValidUrl(url)) {
      return NextResponse.json({ error: "No valid image URL provided" }, { status: 400 });
    }

    // Extract the S3 key from the URL
    const urlObj = new URL(url);
    const key = urlObj.pathname.startsWith("/") ? urlObj.pathname.slice(1) : urlObj.pathname;

    await s3.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Image delete failed" }, { status: 500 });
  }
}