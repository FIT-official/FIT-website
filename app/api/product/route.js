import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Product from "@/models/Product";
import { slugify } from "@/app/api/product/slugify";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { sanitizeString } from "@/utils/validate";
import { getAllCategoriesServer, getAllSubcategoriesServer } from "@/lib/categoriesHelper";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "@/lib/s3";

const BUCKET_NAME = process.env.NEXT_PUBLIC_S3_BUCKET_NAME;

async function deleteS3Object(key) {
    await s3.send(
        new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
        })
    );
}

async function generateUniqueSlug(baseName) {
    let baseSlug = slugify(baseName);
    let slug = baseSlug;
    let attempt = 1;
    let exists = await Product.findOne({ slug });
    while (exists) {
        attempt++;
        slug = `${baseSlug}-${attempt}`;
        exists = await Product.findOne({ slug });
        if (attempt > 100) break;
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
        const requiredFields = [
            "creatorUserId",
            "name",
            "description",
            "images",
            "basePrice",
            "priceCredits",
            "productType"
        ];
        const missingFields = requiredFields.filter(field => !body[field]);
        if (missingFields.length > 0) {
            return NextResponse.json({ error: "Missing required fields", missingFields }, { status: 400 });
        }

        const name = sanitizeString(body.name).trim();
        const description = sanitizeString(body.description).trim();
        const productType = sanitizeString(body.productType).trim();

        if (!["shop", "print"].includes(productType)) {
            return NextResponse.json({ error: "Invalid product type" }, { status: 400 });
        }

        let userRole = "user";

        const client = await clerkClient()
        const userObj = await client.users.getUser(userId)
        if (userObj && userObj.publicMetadata && userObj.publicMetadata.role) {
            userRole = userObj.publicMetadata.role;
        }
        if (productType === "shop" && userRole !== "admin") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        if (
            !Array.isArray(body.images) ||
            body.images.some(key => typeof key !== "string" || !key.trim())
        ) {
            return NextResponse.json({ error: "Invalid images array" }, { status: 400 });
        }

        if (
            !Array.isArray(body.paidAssets) ||
            body.paidAssets.some(key => typeof key !== "string" || !key.trim())
        ) {
            return NextResponse.json({ error: "Invalid paid assets array" }, { status: 400 });
        }

        if (typeof body.basePrice !== "object" || isNaN(Number(body.basePrice.presentmentAmount))) {
            return NextResponse.json({ error: "Invalid basePrice" }, { status: 400 });
        }

        const slug = await generateUniqueSlug(name);

        try {
            const product = await Product.create({
                ...body,
                name,
                description,
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

export async function PUT(req) {
    try {
        const { userId } = await auth();
        if (!userId)
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        await connectToDatabase();
        const body = await req.json();

        const { searchParams } = new URL(req.url);
        const productId = searchParams.get("productId");
        if (!productId) {
            return NextResponse.json({ error: "Missing productId" }, { status: 400 });
        }

        // Fetch previous product for asset comparison
        const prevProduct = await Product.findById(productId).lean();
        if (!prevProduct) {
            return NextResponse.json({ error: "Product not found" }, { status: 404 });
        }

        // Compare images
        const prevImages = prevProduct.images || [];
        const newImages = body.images || [];
        const removedImages = prevImages.filter(img => !newImages.includes(img));

        // Compare paid assets
        const prevModels = prevProduct.paidAssets || [];
        const newModels = body.paidAssets || [];
        const removedModels = prevModels.filter(model => !newModels.includes(model));

        // Compare viewable model
        const prevViewable = prevProduct.viewableModel || "";
        const newViewable = body.viewableModel || "";
        const removedViewable = prevViewable && prevViewable !== newViewable ? prevViewable : null;

        for (const img of removedImages) {
            await deleteS3Object(img);
        }

        for (const model of removedModels) {
            await deleteS3Object(model);
        }

        if (removedViewable) {
            await deleteS3Object(removedViewable);
        }

        const requiredFields = [
            "creatorUserId",
            "name",
            "description",
            "images",
            "basePrice",
            "priceCredits",
            "productType"
        ];

        const missingFields = requiredFields.filter(field => !body[field]);

        if (missingFields.length > 0) {
            return NextResponse.json({ error: "Missing required fields", missingFields }, { status: 400 });
        }

        const name = sanitizeString(body.name).trim();
        const description = sanitizeString(body.description).trim();
        const productType = sanitizeString(body.productType).trim();

        if (!["shop", "print"].includes(productType)) {
            return NextResponse.json({ error: "Invalid product type" }, { status: 400 });
        }

        let userRole = "user";
        const client = await clerkClient()
        const userObj = await client.users.getUser(userId)
        if (userObj && userObj.publicMetadata && userObj.publicMetadata.role) {
            userRole = userObj.publicMetadata.role;
        }
        if (productType === "shop" && userRole !== "admin") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        if (
            !Array.isArray(body.images) ||
            body.images.some(key => typeof key !== "string" || !key.trim())
        ) {
            return NextResponse.json({ error: "Invalid images array" }, { status: 400 });
        }

        if (
            !Array.isArray(body.paidAssets) ||
            body.paidAssets.some(key => typeof key !== "string" || !key.trim())
        ) {
            return NextResponse.json({ error: "Invalid paidAssets array" }, { status: 400 });
        }

        if (typeof body.basePrice !== "object" || isNaN(Number(body.basePrice.presentmentAmount))) {
            return NextResponse.json({ error: "Invalid basePrice" }, { status: 400 });
        }

        let slug = body.slug;
        if (body.name) {
            slug = await generateUniqueSlug(name);
        }

        const update = {
            ...body,
            name,
            description,
            productType,
            slug,
        };

        const updated = await Product.findByIdAndUpdate(productId, update, { new: true });
        if (!updated) {
            return NextResponse.json({ error: "Product not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true, product: updated }, { status: 200 });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}

export async function GET(req) {
    try {
        await connectToDatabase();
        const { searchParams } = new URL(req.url);

        const productType = searchParams.get("productType");
        const ids = searchParams.get("ids");
        let productCategory = searchParams.get("productCategory");
        let productSubCategory = searchParams.get("productSubCategory");
        const productId = searchParams.get("productId");
        const slug = searchParams.get("slug");
        const creatorUserId = searchParams.get("creatorUserId");
        const fields = searchParams.get("fields"); // comma-separated string

        let filter = {};

        if (slug) {
            const projection = fields ? fields.split(",").map(f => f.trim()).join(" ") : undefined;
            const product = await Product.findOne({ slug }).select(projection).lean();
            return NextResponse.json({ product: product || null }, { status: 200 });
        }

        if (productType) filter.productType = productType;

        if (productCategory && isNaN(Number(productCategory))) {
            // Use combined categories (hardcoded + admin-created)
            const allCategories = await getAllCategoriesServer(productType);
            productCategory = allCategories.findIndex(cat => cat === productCategory);
        }

        if (
            productSubCategory &&
            isNaN(Number(productSubCategory)) &&
            productCategory !== null &&
            productCategory !== -1
        ) {
            // Resolve subcategory name to index using server helper (handles legacy hardcoded + admin DB)
            const subcats = await getAllSubcategoriesServer(productType, productCategory);
            productSubCategory = subcats.findIndex(sub => sub === productSubCategory);
        }

        if (ids) {
            const idArr = ids.split(",").map(id => id.trim()).filter(Boolean);
            if (idArr.length > 0) filter._id = { $in: idArr };
        }
        if (productId) filter._id = productId;
        if (creatorUserId) filter.creatorUserId = creatorUserId;

        if (
            productCategory !== undefined &&
            productCategory !== null &&
            productCategory !== -1 &&
            productSubCategory !== undefined &&
            productSubCategory !== null &&
            productSubCategory !== -1
        ) {
            filter.category = Number(productCategory);
            filter.subcategory = Number(productSubCategory);
        } else if (
            productCategory !== undefined &&
            productCategory !== null &&
            productCategory !== -1
        ) {
            filter.category = Number(productCategory);
        } else if (
            !ids &&
            !productId &&
            !creatorUserId &&
            (
                productCategory === undefined ||
                productCategory === null ||
                productCategory === -1
            )
        ) {
            return NextResponse.json({ error: "Missing productCategory or productSubCategory" }, { status: 400 });
        }

        const projection = fields ? fields.split(",").map(f => f.trim()).join(" ") : undefined;

        const products = await Product.find(filter).select(projection).lean();

        if (productId) {
            return NextResponse.json({ product: products[0] || null }, { status: 200 });
        }

        return NextResponse.json({ products }, { status: 200 });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}

export async function DELETE(req) {
    try {
        const { userId } = await auth();
        if (!userId)
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        await connectToDatabase();
        const { searchParams } = new URL(req.url);
        const productId = searchParams.get("productId");
        if (!productId) {
            return NextResponse.json({ error: "Missing productId" }, { status: 400 });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return NextResponse.json({ error: "Product not found" }, { status: 404 });
        }

        if (product.creatorUserId !== userId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        for (const img of product.images || []) {
            await deleteS3Object(img);
        }

        for (const model of product.paidAssets || []) {
            await deleteS3Object(model);
        }

        if (product.viewableModel) {
            await deleteS3Object(product.viewableModel);
        }

        await Product.findByIdAndDelete(productId);

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}