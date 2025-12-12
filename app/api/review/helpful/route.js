import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/db";
import Product from "@/models/Product";

export const dynamic = 'force-dynamic';

// POST - Mark review as helpful or unhelpful
export async function POST(req) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();

        const { productId, reviewId } = await req.json();

        if (!productId || !reviewId) {
            return NextResponse.json({ error: "Product ID and review ID are required" }, { status: 400 });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return NextResponse.json({ error: "Product not found" }, { status: 404 });
        }

        const review = product.reviews.id(reviewId);
        if (!review) {
            return NextResponse.json({ error: "Review not found" }, { status: 404 });
        }

        // Toggle helpful status
        const helpfulIndex = review.helpful.indexOf(userId);
        if (helpfulIndex > -1) {
            // User already marked as helpful, remove it
            review.helpful.splice(helpfulIndex, 1);
        } else {
            // Add user to helpful list
            review.helpful.push(userId);
        }

        await product.save();

        return NextResponse.json({
            success: true,
            helpfulCount: review.helpful.length,
            isHelpful: helpfulIndex === -1
        }, { status: 200 });

    } catch (error) {
        console.error("Error marking review as helpful:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
