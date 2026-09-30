import ServicePage, { serviceMetadata } from '@/components/Services/ServicePage'
import { researchServices } from '@/lib/content/researchServices'

const page = {
    ...researchServices.design,
    description: 'Need a custom 3D model or printed part? Send FIT a sketch, photo or CAD file with dimensions and a deadline. Agree the design, revisions and deliverables before work starts.',
}
export const metadata = serviceMetadata(page)

export default function DesignPrintingPage() {
    return <ServicePage page={page} />
}
