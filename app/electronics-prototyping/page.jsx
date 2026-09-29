import ServicePage, { serviceMetadata } from '@/components/Services/ServicePage'
import { researchServices } from '@/lib/content/researchServices'

const page = researchServices.electronics
export const metadata = serviceMetadata(page)

export default function ElectronicsPrototypingPage() {
    return <ServicePage page={page} />
}
