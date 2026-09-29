import ServicePage, { serviceMetadata } from '@/components/Services/ServicePage'
import { researchServices } from '@/lib/content/researchServices'

const page = researchServices.design
export const metadata = serviceMetadata(page)

export default function DesignPrintingPage() {
    return <ServicePage page={page} />
}
