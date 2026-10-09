import Link from 'next/link'
import Logo from '@/components/Logo'
import { readMaintenanceConfig, isPageActive, formatSgtWindow } from '@/lib/maintenance/config'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Maintenance | Fix It Today', robots: { index: false, follow: false } }

export default async function MaintenancePage() {
    const cfg = await readMaintenanceConfig()
    const active = isPageActive(cfg.page)
    return <main className="flex min-h-[65vh] w-full items-center justify-center px-5 py-20 md:px-12">
        <section className="w-full max-w-xl rounded-2xl border border-borderColor bg-baseColor p-6 sm:p-10" aria-labelledby="maintenance-title">
            <Logo className="mb-5 h-16 w-16 text-textColor" aria-label="Fix It Today" role="img" />
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-lightColor">Fix It Today</p>
            <h1 id="maintenance-title" className="text-3xl">{active ? cfg.page.title || 'We’ll be back soon' : 'The site is running normally'}</h1>
            <p className="mt-5 whitespace-pre-line break-words text-lightColor">{active ? cfg.page.message || 'We’re taking a short break for maintenance. Thank you for your patience.' : 'The shop is open. You can continue browsing.'}</p>
            {active && cfg.page.until && <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Expected back: {formatSgtWindow(cfg.page.until, null)}</p>}
            <a className="mt-6 block break-words text-sm underline underline-offset-4" href="mailto:fixittoday.contact@gmail.com">fixittoday.contact@gmail.com</a>
            {!active && <Link href="/" className="mt-8 inline-flex rounded-full bg-textColor px-6 py-3 text-sm font-medium text-background">Back to home</Link>}
        </section>
    </main>
}
