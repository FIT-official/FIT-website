import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/db";
import Product from "@/models/Product";
import Order from "@/models/Order";
import User from "@/models/User";
import { uploadImages, deleteFromS3 } from "@/lib/s3";

export const dynamic = 'force-dynamic';

// POST - Create a new review
export async function POST(req) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();

        const { productId, orderId, rating, comment, mediaFiles } = await req.json();

        if (!productId || !rating) {
            return NextResponse.json({ error: "Product ID and rating are required" }, { status: 400 });
        }

        if (rating < 1 || rating > 5) {
            return NextResponse.json({ error: "Rating must be between 1 and 5" }, { status: 400 });
        }

        // Get product
        const product = await Product.findById(productId);
        if (!product) {
            return NextResponse.json({ error: "Product not found" }, { status: 404 });
        }

        // Check if user already reviewed this product
        const existingReview = product.reviews.find(r => r.userId === userId);
        if (existingReview) {
            return NextResponse.json({ error: "You have already reviewed this product" }, { status: 400 });
        }

        // Get user details from Clerk
        const response = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
            headers: {
                Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
            },
        });

        if (!response.ok) {
            return NextResponse.json({ error: "Failed to fetch user details" }, { status: 500 });
        }

        const clerkUser = await response.json();
        const username = clerkUser.username || clerkUser.firstName || "Anonymous";
        const userImageUrl = clerkUser.image_url || clerkUser.imageUrl || null;

        // Upload media if provided
        let mediaUrls = [];
        if (mediaFiles && mediaFiles.length > 0) {
            try {
                const uploadedUrls = await uploadImages(mediaFiles, `reviews/${productId}/${userId}`);
                mediaUrls = uploadedUrls;
            } catch (error) {
                console.error("Error uploading review media:", error);
                return NextResponse.json({ error: "Failed to upload media" }, { status: 500 });
            }
        }

        // Check if this is a verified purchase
        let verifiedPurchase = false;
        let purchasedVariants = {};

        if (orderId) {
            const order = await Order.findOne({ orderId, userId });
            if (order) {
                const orderItem = order.items.find(item => item.productId.toString() === productId);
                if (orderItem) {
                    verifiedPurchase = true;
                    purchasedVariants = orderItem.selectedVariants || {};

                    // Mark the order item as reviewed
                    orderItem.reviewed = true;
                    await order.save();
                }
            }
        } else {
            // Check user's order history for this product (backward compatibility)
            const user = await User.findOne({ userId });
            if (user && user.orderHistory) {
                const hasOrdered = user.orderHistory.some(order =>
                    order.cartItem && order.cartItem.productId === productId
                );
                if (hasOrdered) {
                    verifiedPurchase = true;
                }
            }
        }

        // Create review
        const newReview = {
            userId,
            username,
            userImageUrl,
            rating,
            comment: comment || "",
            mediaUrls,
            purchasedVariants,
            verifiedPurchase,
            helpful: []
        };

        product.reviews.push(newReview);
        await product.save();

        // Get the created review with its ID
        const createdReview = product.reviews[product.reviews.length - 1];

        // Update order item with reviewId if order exists
        if (orderId && verifiedPurchase) {
            const order = await Order.findOne({ orderId, userId });
            if (order) {
                const orderItem = order.items.find(item => item.productId.toString() === productId);
                if (orderItem) {
                    orderItem.reviewId = createdReview._id;
                    await order.save();
                }
            }
        }

        return NextResponse.json({
            success: true,
            review: createdReview,
            message: "Review submitted successfully"
        }, { status: 201 });

    } catch (error) {
        console.error("Error creating review:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// PUT - Update an existing review
export async function PUT(req) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();

        const { productId, reviewId, rating, comment, mediaFiles, removedMediaUrls } = await req.json();

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

        // Check ownership
        if (review.userId !== userId) {
            return NextResponse.json({ error: "You can only edit your own reviews" }, { status: 403 });
        }

        // Delete removed media from S3
        if (removedMediaUrls && removedMediaUrls.length > 0) {
            for (const url of removedMediaUrls) {
                try {
                    const key = url.split('.com/')[1];
                    await deleteFromS3(key);
                } catch (error) {
                    console.error("Error deleting media from S3:", error);
                }
            }
            review.mediaUrls = review.mediaUrls.filter(url => !removedMediaUrls.includes(url));
        }

        // Upload new media if provided
        if (mediaFiles && mediaFiles.length > 0) {
            try {
                const uploadedUrls = await uploadImages(mediaFiles, `reviews/${productId}/${userId}`);
                review.mediaUrls = [...review.mediaUrls, ...uploadedUrls];
            } catch (error) {
                console.error("Error uploading review media:", error);
                return NextResponse.json({ error: "Failed to upload media" }, { status: 500 });
            }
        }

        // Validate media count
        if (review.mediaUrls.length > 3) {
            return NextResponse.json({ error: "Maximum 3 media files allowed" }, { status: 400 });
        }

        // Update review fields
        if (rating !== undefined) {
            if (rating < 1 || rating > 5) {
                return NextResponse.json({ error: "Rating must be between 1 and 5" }, { status: 400 });
            }
            review.rating = rating;
        }

        if (comment !== undefined) {
            review.comment = comment;
        }

        await product.save();

        return NextResponse.json({
            success: true,
            review,
            message: "Review updated successfully"
        }, { status: 200 });

    } catch (error) {
        console.error("Error updating review:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// DELETE - Delete a review
export async function DELETE(req) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectToDatabase();

        const { searchParams } = new URL(req.url);
        const productId = searchParams.get("productId");
        const reviewId = searchParams.get("reviewId");

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

        // Check if user is admin
        const user = await User.findOne({ userId });
        const isAdmin = user?.metadata?.role === "Admin";

        // Check ownership or admin
        if (review.userId !== userId && !isAdmin) {
            return NextResponse.json({ error: "You can only delete your own reviews" }, { status: 403 });
        }

        // Delete media from S3
        if (review.mediaUrls && review.mediaUrls.length > 0) {
            for (const url of review.mediaUrls) {
                try {
                    const key = url.split('.com/')[1];
                    await deleteFromS3(key);
                } catch (error) {
                    console.error("Error deleting media from S3:", error);
                }
            }
        }

        // Remove review
        review.deleteOne();
        await product.save();

        // Update order item to mark as not reviewed
        const order = await Order.findOne({
            userId: review.userId,
            'items.reviewId': reviewId
        });
        if (order) {
            const orderItem = order.items.find(item => item.reviewId?.toString() === reviewId);
            if (orderItem) {
                orderItem.reviewed = false;
                orderItem.reviewId = null;
                await order.save();
            }
        }

        return NextResponse.json({
            success: true,
            message: "Review deleted successfully"
        }, { status: 200 });

    } catch (error) {
        console.error("Error deleting review:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
