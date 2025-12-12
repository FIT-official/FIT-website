import { NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { connectToDatabase } from '@/lib/db'
import User from '@/models/User'

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url)
        const idsParam = searchParams.get('ids')

        if (!idsParam) {
            return NextResponse.json({ error: 'User IDs are required' }, { status: 400 })
        }

        const userIds = idsParam.split(',').filter(id => id.trim())

        if (userIds.length === 0) {
            return NextResponse.json({ users: [] }, { status: 200 })
        }

        // Limit to 50 users per request to avoid overload
        if (userIds.length > 50) {
            return NextResponse.json({ error: 'Maximum 50 users per request' }, { status: 400 })
        }

        await connectToDatabase()

        // Get clerk client instance
        const clerk = await clerkClient()

        // Fetch all users from Clerk and MongoDB in parallel
        const [clerkUsersData, dbUsers] = await Promise.all([
            Promise.allSettled(
                userIds.map(userId =>
                    clerk.users.getUser(userId).catch(() => null)
                )
            ),
            User.find({ clerkUserId: { $in: userIds } }).lean()
        ])

        // Create a map of DB users by clerkUserId
        const dbUserMap = {}
        dbUsers.forEach(user => {
            dbUserMap[user.clerkUserId] = user
        })

        // Combine Clerk and DB data
        const users = clerkUsersData.map((result, index) => {
            const userId = userIds[index]
            const clerkUser = result.status === 'fulfilled' ? result.value : null
            const dbUser = dbUserMap[userId]

            if (!clerkUser && !dbUser) {
                return null
            }

            // Check for Stripe account ID in multiple places (priority order)
            const stripeAccountId =
                dbUser?.stripeAccountId || // MongoDB field
                clerkUser?.publicMetadata?.stripeAccountId || // Clerk public metadata
                clerkUser?.privateMetadata?.stripeAccountId || // Clerk private metadata
                null

            return {
                id: userId,
                name: clerkUser ? `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() : 'Unknown User',
                email: clerkUser?.emailAddresses?.[0]?.emailAddress || 'No email',
                phone: clerkUser?.phoneNumbers?.[0]?.phoneNumber || dbUser?.contact?.phone || 'No phone',
                address: dbUser?.contact?.address
                    ? `${dbUser.contact.address.street || ''}, ${dbUser.contact.address.city || ''}, ${dbUser.contact.address.state || ''} ${dbUser.contact.address.postalCode || ''}`.trim()
                    : 'No address',
                role: dbUser?.role || 'user',
                stripeAccountId: stripeAccountId
            }
        }).filter(user => user !== null)

        return NextResponse.json({ users }, { status: 200 })
    } catch (error) {
        console.error('Error fetching batch users:', error)
        return NextResponse.json(
            { error: 'Failed to fetch users' },
            { status: 500 }
        )
    }
}
