import { NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'

export async function GET(request, { params }) {
    try {
        const { userId: requestingUserId } = await auth()
        if (!requestingUserId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Check if requesting user is admin
        const client = await clerkClient()
        const requestingUser = await client.users.getUser(requestingUserId)

        if (requestingUser.publicMetadata.role !== 'admin') {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
        }

        const { userId } = await params

        // Fetch the target user's data
        const user = await client.users.getUser(userId)

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        // Extract relevant user information
        const userData = {
            id: user.id,
            name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'No name',
            email: user.emailAddresses?.[0]?.emailAddress || 'No email',
            phone: user.phoneNumbers?.[0]?.phoneNumber || 'No phone',
            // Try to get address from private metadata if stored there
            address: user.privateMetadata?.address || user.publicMetadata?.address || 'No address',
            stripeAccountId: user.publicMetadata?.stripeAccountId || null,
            role: user.publicMetadata?.role || null
        }

        return NextResponse.json(userData)
    } catch (error) {
        console.error('Error fetching user data:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}