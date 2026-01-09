import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";

const normalizeDisplayName = (value) => {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ");
};

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await connectToDatabase();
    const user = await User.findOne({ userId }, { "metadata.displayName": 1, "metadata.role": 1, _id: 0 }).lean();

    return NextResponse.json({
      displayName: user?.metadata?.displayName || "",
      role: user?.metadata?.role || "Customer",
    });
  } catch (error) {
    console.error("Error reading display name:", error);
    return NextResponse.json({ error: "Failed to read display name" }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const client = await clerkClient();
    const clerkUser = await client.users.getUser(userId);
    const isAdmin = clerkUser?.publicMetadata?.role === "admin";
    const isSubscribed = Boolean(clerkUser?.publicMetadata?.stripeSubscriptionId);

    if (!isAdmin && !isSubscribed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const displayName = normalizeDisplayName(body?.displayName);

    if (!displayName) {
      return NextResponse.json({ error: "Display name is required" }, { status: 400 });
    }
    if (displayName.length < 3 || displayName.length > 32) {
      return NextResponse.json({ error: "Display name must be 3-32 characters" }, { status: 400 });
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9 _.-]*$/.test(displayName)) {
      return NextResponse.json({ error: "Display name contains invalid characters" }, { status: 400 });
    }

    await connectToDatabase();

    // Case-insensitive uniqueness check
    const existing = await User.findOne({
      userId: { $ne: userId },
      "metadata.displayName": { $regex: `^${displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    }).lean();

    if (existing) {
      return NextResponse.json({ error: "Display name already taken" }, { status: 409 });
    }

    const updated = await User.findOneAndUpdate(
      { userId },
      {
        $set: {
          "metadata.displayName": displayName,
          // Treat subscribed users and admins as creators for shop/chat discovery.
          "metadata.role": "Creator",
        },
        $setOnInsert: { userId },
      },
      { upsert: true, new: true }
    ).lean();

    return NextResponse.json({ success: true, displayName: updated?.metadata?.displayName || displayName });
  } catch (error) {
    console.error("Error updating display name:", error);
    return NextResponse.json({ error: "Failed to update display name" }, { status: 500 });
  }
}
