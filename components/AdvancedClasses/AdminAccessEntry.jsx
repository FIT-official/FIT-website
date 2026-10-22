import Link from 'next/link'

export default function AdminAccessEntry() {
  return <section className="rounded-xl border border-borderColor bg-white p-6">
    <h2 className="text-xl font-semibold">Advanced Classes access</h2>
    <p className="my-3">View the approved accounts, their current verification status and their access to project work and review.</p>
    <Link className="inline-flex rounded-lg bg-textColor px-4 py-3 text-white" href="/admin/advanced-classes">View approved access</Link>
  </section>
}
