import Creators from './Creators'
import { buildPageMetadata } from '@/lib/seo/metadata'

export const metadata = buildPageMetadata({
    title: 'Creator Storefront & Print Job Software Plans | Fix It Today',
    description: 'Create a storefront, list products and manage quotes and print requests with FIT creator plans. Compare Free, Student, Standard and Pro options in SGD.',
    path: '/creators/join',
})

export default function CreatorsPage() {
    return <Creators />
}
