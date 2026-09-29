import { PRIVATE_PAGE_ROBOTS } from '@/lib/seo/metadata'

export const metadata = { robots: PRIVATE_PAGE_ROBOTS }

export default function PrivateLayout({ children }) {
    return children
}