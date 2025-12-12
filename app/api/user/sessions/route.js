import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

export async function DELETE(req) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { sessionId } = body || {};

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ error: "Missing or invalid sessionId" }, { status: 400 });
    }

    // Ensure the session belongs to the current user before revoking
    const session = await clerkClient.sessions.getSession(sessionId).catch(() => null);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.userId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await clerkClient.sessions.revokeSession(sessionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error revoking session:", error);
    return NextResponse.json({ error: "Failed to sign out device" }, { status: 500 });
  }
}
