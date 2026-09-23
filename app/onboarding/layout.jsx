import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function RootLayout({ children }) {
    const { userId } = await auth()
    if (!userId) redirect('/sign-in')
    // The page checks completion so it can preserve a validated priceId from
    // searchParams; layouts do not receive the current query parameters.
    return <>{children}</>
}
