import { clerkClient } from "@clerk/nextjs/server";

// Every authenticated account can run a Free storefront. Paid plans change
// capacity, and are verified separately by creatorEntitlements on quota routes.
export async function requireCreator(userId) {
    if (!userId) return false;
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(userId);
    return Boolean(clerkUser?.id === userId);
}
