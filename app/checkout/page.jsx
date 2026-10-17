import FitAddressLine from '@/components/General/FitAddressLine'
import SoftSignInPrompt from '@/components/General/SoftSignInPrompt'
import CheckOut from './CheckOut'
import { isTermsCheckboxEnabled } from '@/lib/legalFlags'

export const metadata = {
    title: 'Checkout | Fix It Today®',
    description: 'Checkout for Fix It Today®',
    openGraph: {
        title: 'Checkout | Fix It Today®',
        description: 'Checkout for Fix It Today®',
        url: 'https://fixitoday.com/checkout',
        siteName: 'Fix It Today®',
        images: [
            {
                url: '/fitogimage.jpg',
                width: 800,
                height: 800,
                alt: 'Fix It Today® Photo',
            },
        ],
        locale: 'en_SG',
        type: 'website',
    },
}

function CheckoutLayout() {
    const termsRequired = isTermsCheckboxEnabled()

    return (
        <>
            <SoftSignInPrompt />
            <CheckOut termsRequired={termsRequired} />
            <FitAddressLine />
        </>
    )
}

export default CheckoutLayout
