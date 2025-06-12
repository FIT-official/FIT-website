import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Product from "@/models/Product";
import { slugify } from "@/app/api/product/slugify";
import { auth } from "@clerk/nextjs/server";
import { sanitizeString, isValidUrl } from "@/utils/validate";

async function generateUniqueSlug(baseName) {
    let slug = slugify(baseName);
    let exists = await Product.findOne({ slug });
    let attempt = 1;
    while (exists) {
        slug = slugify(baseName) + `-${attempt}`;
        exists = await Product.findOne({ slug });
        attempt++;
        if (attempt > 10) break;
    }
    return slug;
}


export async function POST(req) {
    try {
        const { userId } = await auth();
        if (!userId)
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        await connectToDatabase();
        const body = await req.json();

        if (
            !body.creatorUserId ||
            !body.creatorFullName ||
            !body.name ||
            !body.description ||
            !body.images ||
            !body.price ||
            !body.productType
        ) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const name = sanitizeString(body.name).trim();
        const description = sanitizeString(body.description).trim();
        const creatorFullName = sanitizeString(body.creatorFullName).trim();
        const productType = sanitizeString(body.productType).trim();

        if (!["shop", "print"].includes(productType)) {
            return NextResponse.json({ error: "Invalid product type" }, { status: 400 });
        }

        if (!Array.isArray(body.images) || body.images.some(url => !isValidUrl(url))) {
            return NextResponse.json({ error: "Invalid images array" }, { status: 400 });
        }

        if (body.downloadableAssets && (!Array.isArray(body.downloadableAssets) || body.downloadableAssets.some(url => !isValidUrl(url)))) {
            return NextResponse.json({ error: "Invalid downloadableAssets array" }, { status: 400 });
        }

        if (typeof body.price !== "object" || isNaN(Number(body.price.presentmentAmount))) {
            return NextResponse.json({ error: "Invalid price" }, { status: 400 });
        }

        const slug = await generateUniqueSlug(name);

        try {
            const product = await Product.create({
                ...body,
                name,
                description,
                creatorFullName,
                productType,
                slug,
            });
            return NextResponse.json({ success: true, product }, { status: 201 });
        } catch (err) {
            if (err.code === 11000 && err.keyPattern && err.keyPattern.slug) {
                return NextResponse.json({ error: "A product with this slug already exists. Please try again." }, { status: 409 });
            }
            throw err;
        }

        return NextResponse.json({ success: true, product }, { status: 201 });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}