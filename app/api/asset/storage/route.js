import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import DigitalProductTransaction from "@/models/DigitalProductTransaction";
import { authenticate } from "@/lib/authenticate";

export async function GET(request) {
    const { userId } = await authenticate(req);
    try {
        await connectToDatabase();
        const transactions = await DigitalProductTransaction.find({ userId });
        return NextResponse.json({ transactions }, { status: 200 });

    } catch (error) {
        console.error("Error retrieving transactions:", error);
        return NextResponse.json({ error: "Failed to retrieve transactions" }, { status: 500 });
    }
}