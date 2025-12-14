import { NextResponse } from "next/server";
import { authenticate } from "@/lib/authenticate";
import { getStreamServerClient } from "@/lib/streamChat";

// Issues a real Stream Chat user token for the authenticated user.
export async function GET(request) {
    try {
        const { userId } = await authenticate(request);

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const apiKey = process.env.STREAM_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "Stream Chat is not configured" }, { status: 500 });
        }

        const serverClient = getStreamServerClient();
        const token = serverClient.createToken(userId);

        return NextResponse.json({
            userId,
            provider: "stream",
            apiKey,
            token,
        });
    } catch (error) {
        console.error("Error issuing chat token:", error);
        return NextResponse.json({ error: "Failed to issue chat token" }, { status: 500 });
    }
}
