import DashboardPage from './DashboardPage'
import { isCreatorTermsAcceptanceEnabled } from '@/lib/legalFlags'

export const metadata = {
    title: 'Dashboard | Fix It Today®',
    description: 'Manage your products and orders with Fix It Today®',
    openGraph: {
        title: 'Dashboard | Fix It Today®',
        description: 'Manage your products and orders with Fix It Today®',
        url: 'https://fixitoday.com/dashboard',
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

function DashboardHome() {
    return (
        <DashboardPage
            creatorTermsRequired={isCreatorTermsAcceptanceEnabled()}
        />
    )
}

export default DashboardHome
