import PrinterRepairFlow from '@/components/Services/PrinterRepairFlow'
export const metadata = {
  title: '3D Printer Repair Assessment Request | FIT',
  description: 'Tell FIT about your 3D printer, symptoms and checks already tried. Request an assessment and discuss the next step before agreeing any repair work.',
  alternates: { canonical: '/printer-repair' },
  robots: { index: false, follow: true },
}
export default function PrinterRepairPage() { return <main><PrinterRepairFlow /></main> }
