import BulkFilamentForm from '@/components/Shop/BulkFilamentForm'
import { buildPageMetadata } from '@/lib/seo/metadata'
export const metadata = buildPageMetadata({
  title: 'Bulk filament enquiry | Fix It Today',
  description: 'Request filament from recorded inventory, with up to 20 extra rolls per colour for manual availability checks. No payment or reservation.',
  path: '/shop/bulk-filament',
})
export default function BulkFilamentPage() { return <BulkFilamentForm /> }
