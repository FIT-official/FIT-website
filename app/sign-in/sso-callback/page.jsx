import SsoCallback from '@/components/AuthComponents/SsoCallback'
import { subscriptionPriceId } from '@/lib/subscriptionIntent'
import { advancedClassesReturn } from '@/lib/advancedClasses/signInReturn'

export default async function Page({ searchParams }) {
    const params = await searchParams
    return <SsoCallback priceId={subscriptionPriceId(params?.priceId)} returnTo={advancedClassesReturn(params?.redirect_url)} />
}
