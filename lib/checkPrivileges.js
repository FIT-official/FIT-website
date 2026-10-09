import { clerkClient } from "@clerk/nextjs/server";

// Returns true if the user has admin privileges, false otherwise
export async function checkAdminPrivileges(userId) {
    if (!userId) return false;
    try {
        const client = await clerkClient();
        const userObj = await client.users.getUser(userId);
        return ["admin", "owner"].includes(userObj?.publicMetadata?.role);
    } catch (err) {
        console.error('Failed to verify user role:', err);
        return false;
    }
}