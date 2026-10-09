export function publicCreatorFilter() {
    return { 'metadata.role': { $nin: ['owner', 'admin', 'Owner', 'Admin'] },
        ...(process.env.FIT_OWNER_USER_ID ? { userId: { $ne: process.env.FIT_OWNER_USER_ID } } : {}) };
}
export function isPublicCreator(user) {
    return user.userId !== process.env.FIT_OWNER_USER_ID &&
        !['owner', 'admin'].includes(String(user.publicMetadata?.role || user.metadata?.role || '').toLowerCase());
}
