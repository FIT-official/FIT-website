import ServicePage, { serviceMetadata } from '@/components/Services/ServicePage'
import { researchServices } from '@/lib/content/researchServices'

const page = researchServices.metal
export const metadata = serviceMetadata(page)

export default function MetalFabricationPage() {
    return <ServicePage page={page} />
}
