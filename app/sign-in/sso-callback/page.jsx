import SsoCallback from '@/components/AuthComponents/SsoCallback'
import { subscriptionPriceId } from '@/lib/subscriptionIntent'

export default async function Page({ searchParams }) {
    return <SsoCallback priceId={subscriptionPriceId((await searchParams)?.priceId)} />
}
