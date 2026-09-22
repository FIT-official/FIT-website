import { createWebhooksHandler } from '@brianmmdev/clerk-webhooks-handler'
import { clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getPostHogClient } from '@/lib/posthog-server'

const handler = createWebhooksHandler({
    secret: process.env.CLERK_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET,
    onUserCreated: async (user) => {
        // Registration never creates a charge, subscription or Connect account.
        // Client-writable metadata is not authority to perform payment actions.
        const client = await clerkClient()
        const current = await client.users.getUser(user.id)
        // Merge only these keys so a delayed webhook cannot overwrite an
        // onboarding update made after the user was read above.
        await client.users.updateUserMetadata(user.id, {
            publicMetadata: {
                role: current.publicMetadata?.role || 'user',
            },
            unsafeMetadata: { cardToken: null, priceId: null },
        })
        try {
            const phog = getPostHogClient()
            phog.capture({ distinctId: user.id, event: 'user_registered', properties: { has_paid_tier: false, sign_up_method: 'clerk' } })
        } catch { /* Analytics must not prevent registration. */ }
    },
})
export async function POST(req) {
    try {
        const res = await handler.POST(req)
        if (!res || res.status === 404) return NextResponse.json({ received: true })
        return res
    } catch (error) {
        console.error('Account registration webhook failed:', error?.code || error?.name || 'provider_error')
        return NextResponse.json({ error: 'Account setup could not be completed. Please retry.' }, { status: 503 })
    }
}
