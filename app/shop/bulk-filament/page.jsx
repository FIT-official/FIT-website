import BulkFilamentForm from '@/components/Shop/BulkFilamentForm'
import { buildPageMetadata } from '@/lib/seo/metadata'
export const metadata = buildPageMetadata({
  title: 'Bulk filament enquiry | Fix It Today',
  description: 'Enquire about 1kg PLA and PETG filament with quantity pricing and available colours. Final quotation confirmed by FIT.',
  path: '/shop/bulk-filament',
})
export default function BulkFilamentPage() { return <BulkFilamentForm /> }
