import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export async function GET(req) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const client = await clerkClient();
        const user = await client.users.getUser(userId);

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        return NextResponse.json({
            role: user.publicMetadata.role || "user",
        });

    } catch (error) {
        console.error('Error fetching user role:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}