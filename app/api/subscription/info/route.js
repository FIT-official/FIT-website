import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2023-10-16",
});

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const priceId = searchParams.get("priceId");
        if (!priceId) {
            return NextResponse.json({ error: "Missing priceId" }, { status: 400 });
        }

        const priceObject = await stripe.prices.retrieve(priceId);
        const prodID = priceObject.product;
        const productObject = await stripe.products.retrieve(prodID);

        return NextResponse.json({
            productName: productObject.name || "",
            price: (priceObject.unit_amount / 100).toFixed(2),
            interval: priceObject.recurring.interval || "",
            description: productObject.description || "",
            features: productObject.marketing_features || [],
        });
    } catch (error) {
        console.error("Failed to fetch Stripe price info:", error);
        return NextResponse.json({ error: "Failed to fetch product info" }, { status: 500 });
    }
}