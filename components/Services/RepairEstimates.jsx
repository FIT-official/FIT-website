import { REPAIR_ESTIMATES } from '@/lib/printerRepair/validate'

// Display-only price estimates. Not a price list: no SKUs, Stripe prices or cart tiers are read or changed here.
export default function RepairEstimates({ className = '' }) {
  return (
    <aside className={`rounded-xl border border-borderColor bg-baseColor p-4 text-sm text-lightColor ${className}`} aria-label="Repair price estimates" data-repair-estimates="">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide">Estimate</p>
      <ul className="space-y-1">
        <li>{REPAIR_ESTIMATES.drop_off}</li>
        <li>{REPAIR_ESTIMATES.home_visit}</li>
      </ul>
      <p className="mt-2">{REPAIR_ESTIMATES.note}</p>
    </aside>
  )
}