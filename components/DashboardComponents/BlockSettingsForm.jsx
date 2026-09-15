'use client'
// Per-block settings form for the /dashboard/shop page builder. One small
// form per block type, bound to lib/creatorPage/blocks.js limits so the
// client never lets the owner type past what the API accepts. Gallery
// uploads go through POST /api/user/shop/upload (kind=gallery) and only the
// key list lives in the block; the page Save persists it.
import { useRef, useState } from 'react'
import Link from 'next/link'
import { GoX } from 'react-icons/go'
import { IoImageOutline } from 'react-icons/io5'
import { MAX_GALLERY_IMAGES, PRODUCTS_LIMIT } from '@/lib/creatorPage/blocks'

const proxySrc = (key) => `/api/proxy?key=${encodeURIComponent(key)}`

const inputCls = 'w-full rounded-[var(--dash-r-inner)] border border-[var(--dash-line)] bg-[var(--dash-card)] px-3 py-1.5 text-[13px]'

function Field({ label, help, children }) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="dash-label">{label}</span>
            {children}
            {help && <span className="text-[12px] text-[var(--dash-ink-soft)]">{help}</span>}
        </label>
    )
}

function Toggle({ label, checked, onChange }) {
    return (
        <label className="flex items-center gap-2 text-[13px] cursor-pointer">
            <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--dash-ink)]" />
            {label}
        </label>
    )
}

function Counter({ value, max }) {
    return <span className="dash-data dash-soft self-end">{String(value || '').length}/{max}</span>
}

export default function BlockSettingsForm({ block, index, onChange, showToast }) {
    const settings = block.settings || {}
    const set = (patch) => onChange({ ...settings, ...patch })
    const label = (name) => `Block ${index + 1} ${name}`

    const galleryInputRef = useRef(null)
    const [uploading, setUploading] = useState(false)

    const uploadGallery = async (e) => {
        const files = Array.from(e.target.files || [])
        e.target.value = ''
        if (files.length === 0) return
        const existing = Array.isArray(settings.images) ? settings.images : []
        const room = MAX_GALLERY_IMAGES - existing.length
        if (room <= 0) {
            showToast?.(`A gallery holds up to ${MAX_GALLERY_IMAGES} images`, 'error')
            return
        }
        const batch = files.slice(0, room)
        setUploading(true)
        const keys = []
        try {
            for (const file of batch) {
                if (!file.type?.startsWith('image/')) continue
                const formData = new FormData()
                formData.append('file', file)
                formData.append('kind', 'gallery')
                const res = await fetch('/api/user/shop/upload', { method: 'POST', body: formData })
                const data = await res.json().catch(() => ({}))
                if (!res.ok || !data.key) throw new Error(data.error || 'Upload failed')
                keys.push(data.key)
            }
            if (keys.length > 0) set({ images: [...existing, ...keys].slice(0, MAX_GALLERY_IMAGES) })
            if (files.length > room) showToast?.(`Only ${room} more image${room === 1 ? '' : 's'} fit in this gallery`, 'error')
        } catch (err) {
            if (keys.length > 0) set({ images: [...existing, ...keys].slice(0, MAX_GALLERY_IMAGES) })
            showToast?.(err?.message || 'Upload failed', 'error')
        } finally {
            setUploading(false)
        }
    }

    const heading = (help) => (
        <Field label="Heading" help={help}>
            <input
                value={settings.heading || ''}
                maxLength={80}
                aria-label={label('heading')}
                onChange={(e) => set({ heading: e.target.value })}
                className={inputCls}
            />
        </Field>
    )

    switch (block.type) {
        case 'hero':
            return (
                <div className="flex flex-col gap-4">
                    <Field label="Headline" help="Leave empty to use your shop name.">
                        <input value={settings.headline || ''} maxLength={80} aria-label={label('headline')} onChange={(e) => set({ headline: e.target.value })} className={inputCls} />
                    </Field>
                    <Field label="Subheadline" help="Leave empty to use your description from Page settings.">
                        <input value={settings.subheadline || ''} maxLength={160} aria-label={label('subheadline')} onChange={(e) => set({ subheadline: e.target.value })} className={inputCls} />
                    </Field>
                    <div className="flex flex-wrap gap-4">
                        <Toggle label="Show banner" checked={settings.showBanner !== false} onChange={(v) => set({ showBanner: v })} />
                        <Toggle label="Show logo" checked={settings.showLogo !== false} onChange={(v) => set({ showLogo: v })} />
                    </div>
                </div>
            )
        case 'text':
            return (
                <div className="flex flex-col gap-4">
                    {heading()}
                    <Field label="Body" help="Markdown is supported: **bold**, lists, links.">
                        <textarea
                            value={settings.body || ''}
                            maxLength={2000}
                            rows={6}
                            aria-label={label('body')}
                            onChange={(e) => set({ body: e.target.value })}
                            className={`${inputCls} resize-y`}
                        />
                        <Counter value={settings.body} max={2000} />
                    </Field>
                </div>
            )
        case 'gallery': {
            const images = Array.isArray(settings.images) ? settings.images : []
            return (
                <div className="flex flex-col gap-4">
                    {heading()}
                    <div className="flex flex-col gap-2">
                        <span className="dash-label">Images ({images.length}/{MAX_GALLERY_IMAGES})</span>
                        {images.length > 0 && (
                            <div className="grid grid-cols-4 gap-2">
                                {images.map((key, i) => (
                                    <div key={`${key}-${i}`} className="relative aspect-square rounded-[var(--dash-r-inner)] overflow-hidden border border-[var(--dash-line)]">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={proxySrc(key)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                                        <button
                                            type="button"
                                            aria-label={`Remove gallery image ${i + 1}`}
                                            onClick={() => set({ images: images.filter((_, j) => j !== i) })}
                                            className="absolute top-1 right-1 h-6 w-6 grid place-items-center rounded-full bg-[var(--dash-ink)] text-[var(--dash-canvas)] cursor-pointer"
                                        >
                                            <GoX aria-hidden="true" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden" onChange={uploadGallery} aria-label={label('gallery upload')} />
                        {images.length < MAX_GALLERY_IMAGES && (
                            <button
                                type="button"
                                disabled={uploading}
                                onClick={() => galleryInputRef.current?.click()}
                                className="dash-hoverable flex items-center gap-1.5 w-fit rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] px-3 py-1.5 text-[13px] font-medium hover:bg-[var(--dash-canvas)] cursor-pointer disabled:opacity-50"
                            >
                                <IoImageOutline aria-hidden="true" />
                                {uploading ? 'Uploading...' : 'Add images'}
                            </button>
                        )}
                    </div>
                </div>
            )
        }
        case 'products':
            return (
                <div className="flex flex-col gap-4">
                    {heading('Defaults to "Products" (or "Featured").')}
                    <Field label="Show" help="All: your featured picks first, then everything. Featured: only the picks from Page settings.">
                        <select value={settings.mode === 'featured' ? 'featured' : 'all'} aria-label={label('mode')} onChange={(e) => set({ mode: e.target.value })} className={inputCls}>
                            <option value="all">All products</option>
                            <option value="featured">Featured only</option>
                        </select>
                    </Field>
                    <Field label="Limit" help={`Between ${PRODUCTS_LIMIT.min} and ${PRODUCTS_LIMIT.max}.`}>
                        <input
                            type="number"
                            min={PRODUCTS_LIMIT.min}
                            max={PRODUCTS_LIMIT.max}
                            value={settings.limit ?? PRODUCTS_LIMIT.max}
                            aria-label={label('limit')}
                            onChange={(e) => {
                                const n = Number(e.target.value)
                                set({ limit: Number.isFinite(n) ? Math.min(PRODUCTS_LIMIT.max, Math.max(PRODUCTS_LIMIT.min, Math.round(n))) : PRODUCTS_LIMIT.max })
                            }}
                            className={inputCls}
                        />
                    </Field>
                </div>
            )
        case 'printService':
            return (
                <div className="flex flex-col gap-4">
                    {heading('Defaults to your print service headline.')}
                    <p className="text-[12px] text-[var(--dash-ink-soft)]">
                        Shows your custom print service (materials, prices, lead time and an upload button) once it is enabled in{' '}
                        <Link href="/dashboard/print-jobs" className="underline hover:text-[var(--dash-ink)]">Print jobs</Link>. Hidden until then.
                    </p>
                </div>
            )
        case 'links':
            return (
                <div className="flex flex-col gap-4">
                    {heading()}
                    <p className="text-[12px] text-[var(--dash-ink-soft)]">Shows the links from Page settings as chips. Hidden when there are none.</p>
                </div>
            )
        case 'contact':
            return (
                <div className="flex flex-col gap-4">
                    {heading('Defaults to "Get in touch".')}
                    <Field label="Blurb">
                        <textarea value={settings.blurb || ''} maxLength={300} rows={3} aria-label={label('blurb')} onChange={(e) => set({ blurb: e.target.value })} className={`${inputCls} resize-y`} />
                        <Counter value={settings.blurb} max={300} />
                    </Field>
                    <Toggle label="Show Message button" checked={settings.showMessageButton !== false} onChange={(v) => set({ showMessageButton: v })} />
                </div>
            )
        default:
            return null
    }
}
