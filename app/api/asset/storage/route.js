import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/db";
import DigitalProductTransaction from "@/models/DigitalProductTransaction";

export async function GET( request )  {
    const { userId } = await auth();

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        await connectToDatabase();
        const transactions = await DigitalProductTransaction.find({ userId });
        return NextResponse.json({ transactions }, { status: 200 });
        
    } catch (error) {
        console.error("Error retrieving transactions:", error);
        return NextResponse.json({ error: "Failed to retrieve transactions" }, { status: 500 });
    }
}