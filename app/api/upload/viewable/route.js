import { NextResponse } from "next/server";
import { s3 } from "@/lib/s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@clerk/nextjs/server";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const BUCKET_NAME = process.env.NEXT_PUBLIC_S3_BUCKET_NAME;


export const runtime = "nodejs";

// export async function POST(req) {
//     try {
//         const { userId } = await auth();
//         if (!userId)
//             return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

//         const formData = await req.formData();
//         const file = formData.get("file");

//         if (!file) {
//             return NextResponse.json({ error: "No viewable model file uploaded" }, { status: 400 });
//         }

//         if (file.size > MAX_SIZE) {
//             return NextResponse.json({ error: `File ${file.name} exceeds 15MB limit.` }, { status: 400 });
//         }

//         const ext = file.name.split(".").pop()?.toLowerCase() || "";

//         if (!ALLOWED_MODEL_EXTS.includes(ext)) {
//             return NextResponse.json({ error: `File type .${ext} not allowed for viewable model.` }, { status: 400 });
//         }

//         const arrayBuffer = await file.arrayBuffer();
//         const buffer = Buffer.from(arrayBuffer);

//         if (!checkMagicNumber(buffer, ext)) {
//             return NextResponse.json({ error: `File ${file.name} failed magic number check for .${ext}` }, { status: 400 });
//         }

//         const filename = `viewables/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

//         await s3.send(
//             new PutObjectCommand({
//                 Bucket: BUCKET_NAME,
//                 Key: filename,
//                 Body: buffer,
//                 ContentType: file.type || "application/octet-stream",
//                 CacheControl: "public, max-age=31536000",
//             })
//         );

//         return NextResponse.json({ file: filename }, { status: 200 });
//     } catch (error) {
//         return NextResponse.json({ error: error.message || "Model upload failed" }, { status: 500 });
//     }
// }

export async function POST(req) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { filename, contentType } = await req.json();
    if (!filename || !contentType) {
        return NextResponse.json({ error: "Missing filename or contentType" }, { status: 400 });
    }
    const key = `viewables/${Date.now()}-${Math.random().toString(36).slice(2)}-${filename}`;
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: contentType,
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 60 * 5 }); // 5 minutes
    return NextResponse.json({ url, key });
}