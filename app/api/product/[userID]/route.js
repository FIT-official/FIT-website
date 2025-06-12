import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Product from "@/models/Product";

export async function GET(req, { params }) {
  try {
    await connectToDatabase();
    const { userID } = await params;
    if (!userID) {
      return NextResponse.json({ error: "Missing userID" }, { status: 400 });
    }
    const products = await Product.find({ creatorUserId: userID }).sort({
      createdAt: -1,
    });
    return NextResponse.json({ products }, { status: 200 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
