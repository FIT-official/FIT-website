'use client'
import { usePathname } from 'next/navigation'

// The projection route must not mount storefront, analytics, chat or dashboard UI.
export default function PresentationBoundary({ presentation, children }) {
    return ['/admin/workshop/instructions', '/admin/workshop/projects'].includes(usePathname()) ? presentation : children
}
