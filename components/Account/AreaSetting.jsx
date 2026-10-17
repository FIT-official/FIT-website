'use client'
import { useEffect, useState } from 'react'
import AreaSelect from '@/components/Location/AreaSelect'

// Optional account field. Stored server-side; visible to you and FIT admin only.
export default function AreaSetting() {
  const [area, setArea] = useState(''), [saved, setSaved] = useState(''), [status, setStatus] = useState('')
  useEffect(() => {
    fetch('/api/user/profile', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(body => { const a = body?.profile?.area || ''; setArea(a); setSaved(a) }).catch(() => {})
  }, [])
  async function save() {
    setStatus('Saving…')
    const r = await fetch('/api/user/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ area }) }).catch(() => null)
    if (r?.ok) { setSaved(area); setStatus('Saved.') } else setStatus('Could not save. Try again.')
  }
  return (
    <section className="mb-8 flex flex-col gap-3 text-sm" aria-labelledby="account-area-heading">
      <h2 id="account-area-heading" className="text-base font-semibold">Area</h2>
      <AreaSelect id="account-area" label="Area" value={area} onChange={value => { setArea(value); setStatus('') }} className="flex flex-col gap-1" selectClassName="max-w-sm rounded-lg border border-borderColor bg-background px-3 py-2" />
      <div className="flex items-center gap-3">
        <button type="button" className="rounded-full border border-borderColor px-4 py-2" disabled={area === saved} onClick={save}>Save area</button>
        <p role="status" className="text-lightColor">{status}</p>
      </div>
    </section>
  )
}