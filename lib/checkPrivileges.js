import { clerkClient } from "@clerk/nextjs/server";

// Returns true if the user has admin privileges, false otherwise
export async function checkAdminPrivileges(userId) {
    try {
        const client = await clerkClient();
        const userObj = await client.users.getUser(userId);
        return userObj?.publicMetadata?.role === "admin";
    } catch (err) {
        console.error('Failed to verify user role:', err);
        return false;
    }
}