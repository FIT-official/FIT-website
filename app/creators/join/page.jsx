import Creators from './Creators'
import { buildPageMetadata } from '@/lib/seo/metadata'

export const metadata = buildPageMetadata({
    title: 'Creator Storefront & Print Job Software Plans | Fix It Today',
    description: 'Start your own 3D printing storefront with FIT. Add products, manage print requests and agree jobs with your customers. Start free and compare the existing software plans.',
    path: '/creators/join',
})

export default function CreatorsPage() {
    return <Creators />
}
