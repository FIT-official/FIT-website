'use client'

import { useState } from 'react'

export default function CatalogueCopy() {
    const [preview, setPreview] = useState(null)
    const [result, setResult] = useState(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    async function run(apply) {
        setBusy(true); setError('')
        try {
            const response = await fetch('/api/admin/catalogue-copy', apply ? {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'clean-catalogue-copy' }),
            } : { cache: 'no-store' })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'The catalogue could not be checked.')
            if (apply) { setResult(data); setPreview(null) } else { setPreview(data); setResult(null) }
        } catch (error) { setError(error.message) }
        finally { setBusy(false) }
    }
    return <section className="space-y-5 rounded-xl border border-borderColor p-5">
        <button disabled={busy} onClick={() => run(false)} className="rounded-lg border border-borderColor px-4 py-2 text-sm disabled:opacity-50">{busy ? 'Working…' : 'Check catalogue descriptions'}</button>
        {error && <p role="alert">{error}</p>}
        {preview && <div className="space-y-4">
            <p role="status">Checked {preview.scanned} shop listings. {preview.affected} need cleanup: {preview.productDescriptions} product descriptions and {preview.deliveryDescriptions} delivery descriptions.</p>
            {preview.examples?.map(item => <article key={item.productId} className="border-t border-borderColor pt-3 text-sm">
                <h2 className="font-semibold">{item.name}</h2>
                {Object.keys(item.after).map(field => <div key={field} className="mt-2 space-y-1">
                    <p><strong>Before:</strong> {item.before[field]}</p>
                    <p><strong>After:</strong> {item.after[field]}</p>
                </div>)}
            </article>)}
            {preview.affected > 0 && <button disabled={busy} onClick={() => run(true)} className="rounded-lg bg-textColor px-4 py-2 text-sm text-background disabled:opacity-50">Clean catalogue descriptions</button>}
        </div>}
        {result && <p role="status">Updated {result.updated} listings. {result.skipped ? `${result.skipped} changed during cleanup and were left untouched. Run the check again.` : 'The original text is saved in the private cleanup history.'}</p>}
    </section>
}
