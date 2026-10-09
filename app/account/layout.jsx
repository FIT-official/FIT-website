import { PRIVATE_PAGE_ROBOTS } from '@/lib/seo/metadata'
import { Suspense } from 'react'

export const metadata = { robots: PRIVATE_PAGE_ROBOTS }

export default function PrivateLayout({ children }) {
    return <Suspense>{children}</Suspense>
}
