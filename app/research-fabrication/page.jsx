import ServicePage, { serviceMetadata } from '@/components/Services/ServicePage'
import { researchServices } from '@/lib/content/researchServices'

const page = researchServices.hub
export const metadata = serviceMetadata(page)

export default function ResearchFabricationPage() {
    return <ServicePage page={page} />
}
