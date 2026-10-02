import Link from 'next/link'
import { PROCUREMENT_SUMMARY } from '@/lib/content/procurement'

export default function ProcurementNote({ className = '' }) {
    return <section className={className} aria-label="School and university procurement">
        <h2 className="text-xl md:text-2xl">School and university procurement</h2>
        <p className="mt-4 max-w-3xl text-sm leading-7">{PROCUREMENT_SUMMARY}</p>
        <p className="mt-3 max-w-3xl text-sm leading-7">Include your quotation, purchase-order and documentation requirements with your project brief.</p>
        <Link href="/procurement" className="mt-5 inline-block text-sm underline underline-offset-4">GeBIZ and Ariba enquiries</Link>
    </section>
}
