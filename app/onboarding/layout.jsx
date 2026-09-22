import { auth, clerkClient } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function RootLayout({ children }) {
    const { userId, sessionClaims } = await auth()
    if (!userId) redirect('/sign-in')
    const complete = sessionClaims?.metadata?.onboardingComplete === true ||
        (await (await clerkClient()).users.getUser(userId))?.publicMetadata?.onboardingComplete === true
    if (complete) {
        redirect('/dashboard/shop')
    }
    return <>{children}</>
}
