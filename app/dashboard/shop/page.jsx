'use client'
// Creator page builder (/dashboard/shop) — the owner surface for the public
// /creators/[id] page. Left column: the block list (add / move / remove, a
// settings form per block) and a "Page settings" tab holding everything the
// old editor had (banner + logo crops, description, links, featured picker,
// accent) plus theme and the Published toggle. Right column: a live preview
// through the same BlockRenderer the public page uses. Images still
// auto-save on upload (the upload route deletes the previous S3 object, so
// the DB pointer must move in the same action); everything else is one PUT
// from the Save button, with an unsaved-changes guard.
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@clerk/nextjs'
import { GoLinkExternal, GoPlus, GoX, GoChevronUp, GoChevronDown, GoTrash } from 'react-icons/go'
import { IoImageOutline } from 'react-icons/io5'
import { useToast } from '@/components/General/ToastProvider'
import { useShopIdentity, CreatorGate } from '@/components/DashboardComponents/CreatorShell'
import ShopImageCropModal from '@/components/DashboardComponents/ShopImageCropModal'
import BlockSettingsForm from '@/components/DashboardComponents/BlockSettingsForm'
import { SkeletonRow, ViewTabs } from '@/components/dashboard-ui'
import CreatorPageFrame from '@/components/CreatorPage/CreatorPageFrame'
import BlockRenderer from '@/components/CreatorPage/BlockRenderer'
import {
    BLOCK_TYPES,
    MAX_BLOCKS,
    THEME_MODES,
    THEME_FONTS,
    DEFAULT_THEME,
    cloneDefaultBlocks,
    makeBlock,
    normalizeTheme,
} from '@/lib/creatorPage/blocks'

const MAX_LINKS = 6
const MAX_FEATURED = 8
const MAX_DESCRIPTION = 600

// Small curated accent set (validated server-side as #rrggbb).
const ACCENT_PRESETS = ['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6', '#111111']

const FONT_LABELS = { sans: 'Sans', serif: 'Serif', mono: 'Mono' }
const MODE_LABELS = { light: 'Light', dark: 'Dark' }

const proxySrc = (key) => `/api/proxy?key=${encodeURIComponent(key)}`

const emptyShop = {
    bannerImage: '',
    logoImage: '',
    description: '',
    links: [],
    featuredProductIds: [],
    accentColor: '',
    theme: { ...DEFAULT_THEME },
    blocks: [],
    published: true,
}

const normalizeUrl = (raw) => {
    const trimmed = String(raw || '').trim()
    if (!trimmed) return ''
    if (/^https?:\/\//i.test(trimmed)) return trimmed
    return `https://${trimmed}`
}

const cleanLinks = (links) =>
    (links || [])
        .map((l) => ({ label: String(l.label || '').trim(), url: normalizeUrl(l.url) }))
        .filter((l) => l.label && l.url)

// The PUT payload for everything the Save button owns (images save on upload).
const savePayload = (shop) => ({
    description: shop.description,
    links: cleanLinks(shop.links),
    featuredProductIds: shop.featuredProductIds,
    accentColor: shop.accentColor,
    theme: normalizeTheme(shop.theme),
    blocks: shop.blocks,
    published: shop.published !== false,
})

const hydrate = (incoming) => {
    const shop = { ...emptyShop, ...(incoming || {}) }
    shop.theme = normalizeTheme(shop.theme)
    shop.blocks = Array.isArray(shop.blocks) && shop.blocks.length > 0 ? shop.blocks : cloneDefaultBlocks()
    shop.published = shop.published !== false
    return shop
}

const blockLabel = (type) => BLOCK_TYPES.find((b) => b.type === type)?.label || type

const blockSummary = (block) => {
    const s = block.settings || {}
    switch (block.type) {
        case 'hero': return s.headline || 'Your name, banner and logo'
        case 'text': return s.heading || (s.body ? s.body.slice(0, 60) : 'Empty text block')
        case 'gallery': return s.heading || `${(s.images || []).length} image${(s.images || []).length === 1 ? '' : 's'}`
        case 'products': return s.heading || (s.mode === 'featured' ? 'Featured only' : 'All products')
        case 'printService': return s.heading || 'Shown when your print service is enabled'
        case 'links': return s.heading || 'Your links as chips'
        case 'contact': return s.heading || 'Get in touch'
        default: return ''
    }
}

const cardCls = 'bg-[var(--dash-card)] border border-[var(--dash-line)] rounded-[var(--dash-r-card)] shadow-[var(--dash-shadow-card)]'
const pillBtnCls = 'dash-hoverable flex items-center gap-1.5 rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] px-4 py-2 text-[13px] font-medium hover:bg-[var(--dash-canvas)] cursor-pointer'
const iconBtnCls = 'dash-hoverable h-7 w-7 grid place-items-center rounded-full text-[var(--dash-ink-soft)] hover:text-[var(--dash-ink)] hover:bg-[var(--dash-canvas)] cursor-pointer shrink-0 disabled:opacity-30 disabled:cursor-default'

function FieldRow({ label, help, children }) {
    return (
        <div className="flex flex-col gap-1.5">
            <span className="dash-label">{label}</span>
            {children}
            {help && <span className="text-[12px] text-[var(--dash-ink-soft)]">{help}</span>}
        </div>
    )
}

function Segmented({ label, options, labels, value, onChange }) {
    return (
        <div className="flex items-center gap-1" role="group" aria-label={label}>
            {options.map((opt) => (
                <button
                    key={opt}
                    type="button"
                    aria-pressed={value === opt}
                    onClick={() => onChange(opt)}
                    className={`dash-hoverable rounded-full px-3 py-1.5 text-[13px] font-medium cursor-pointer border ${
                        value === opt
                            ? 'bg-[var(--dash-ink)] text-[var(--dash-canvas)] border-[var(--dash-ink)]'
                            : 'border-[var(--dash-line)] bg-[var(--dash-card)] hover:bg-[var(--dash-canvas)]'
                    }`}
                >
                    {labels[opt] || opt}
                </button>
            ))}
        </div>
    )
}

function ShopEditor() {
    const { user } = useUser()
    const { displayName } = useShopIdentity()
    const { showToast } = useToast()

    const [shop, setShop] = useState(emptyShop)
    const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(savePayload(emptyShop)))
    const [loaded, setLoaded] = useState(false)
    const [saving, setSaving] = useState(false)
    const [products, setProducts] = useState([])
    const [productsLoaded, setProductsLoaded] = useState(false)
    const [tab, setTab] = useState('blocks')
    const [openBlockId, setOpenBlockId] = useState(null)
    const [addMenuOpen, setAddMenuOpen] = useState(false)

    // Crop flow state: { kind: 'banner'|'logo', src: objectURL }
    const [cropState, setCropState] = useState(null)
    const [uploading, setUploading] = useState(false)
    const bannerInputRef = useRef(null)
    const logoInputRef = useRef(null)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const res = await fetch('/api/user/shop')
                if (!res.ok) return
                const data = await res.json()
                if (!cancelled && data?.shop) {
                    const next = hydrate(data.shop)
                    setShop(next)
                    setSavedSnapshot(JSON.stringify(savePayload(next)))
                }
            } catch {
                // keep defaults; Save will surface errors
            } finally {
                if (!cancelled) setLoaded(true)
            }
        })()
        return () => { cancelled = true }
    }, [])

    useEffect(() => {
        if (!user) return
        let cancelled = false
        ;(async () => {
            try {
                const res = await fetch(`/api/product?creatorUserId=${user.id}`)
                const data = await res.json()
                const list = (data?.products || []).filter((p) => {
                    // Hide the special custom-print config product (same rule as
                    // the products list page).
                    const slug = p.slug || ''
                    const name = p.name || ''
                    return !(
                        (typeof slug === 'string' && slug.includes('custom-print')) ||
                        (typeof name === 'string' && name.toLowerCase().includes('custom 3d print')) ||
                        p._id === 'CP1_CUSTOM_PRINT_CONFIG'
                    )
                })
                if (!cancelled) setProducts(list)
            } catch {
                // featured picker shows the empty hint
            } finally {
                if (!cancelled) setProductsLoaded(true)
            }
        })()
        return () => { cancelled = true }
    }, [user])

    const dirty = loaded && JSON.stringify(savePayload(shop)) !== savedSnapshot

    // Unsaved-changes guard (tab close / reload).
    useEffect(() => {
        if (!dirty) return undefined
        const handler = (e) => {
            e.preventDefault()
            e.returnValue = ''
        }
        window.addEventListener('beforeunload', handler)
        return () => window.removeEventListener('beforeunload', handler)
    }, [dirty])

    const shopHref = useMemo(() => {
        const slug = displayName || user?.id || ''
        return slug ? `/creators/${encodeURIComponent(slug)}` : null
    }, [displayName, user])

    const pickFile = (kind) => (e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return
        if (!file.type.startsWith('image/')) {
            showToast('Please choose an image file', 'error')
            return
        }
        setCropState({ kind, src: URL.createObjectURL(file) })
    }

    // Upload the cropped blob, then move the DB pointer in the same action so
    // the shop never references a deleted key.
    const uploadCropped = async (blob) => {
        const kind = cropState?.kind
        if (!kind) return
        const field = kind === 'banner' ? 'bannerImage' : 'logoImage'
        try {
            setUploading(true)
            const formData = new FormData()
            formData.append('file', new File([blob], `${kind}.jpg`, { type: 'image/jpeg' }))
            formData.append('kind', kind)
            if (shop[field]) formData.append('existingKey', shop[field])
            const res = await fetch('/api/user/shop/upload', { method: 'POST', body: formData })
            const data = await res.json().catch(() => ({}))
            if (!res.ok || !data.key) throw new Error(data.error || 'Upload failed')

            const put = await fetch('/api/user/shop', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: data.key }),
            })
            if (!put.ok) throw new Error('Failed to save image')

            setShop((prev) => ({ ...prev, [field]: data.key }))
            showToast(kind === 'banner' ? 'Banner updated' : 'Logo updated', 'success')
        } catch (err) {
            showToast(err?.message || 'Upload failed', 'error')
        } finally {
            setUploading(false)
            if (cropState?.src) URL.revokeObjectURL(cropState.src)
            setCropState(null)
        }
    }

    const removeImage = async (kind) => {
        const field = kind === 'banner' ? 'bannerImage' : 'logoImage'
        try {
            const res = await fetch('/api/user/shop', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: '' }),
            })
            if (!res.ok) throw new Error('Failed to remove image')
            setShop((prev) => ({ ...prev, [field]: '' }))
            showToast(kind === 'banner' ? 'Banner removed' : 'Logo removed', 'success')
        } catch (err) {
            showToast(err?.message || 'Failed to remove image', 'error')
        }
    }

    const updateLink = (index, patch) => {
        setShop((prev) => ({
            ...prev,
            links: prev.links.map((l, i) => (i === index ? { ...l, ...patch } : l)),
        }))
    }

    const addLink = () => {
        setShop((prev) =>
            prev.links.length >= MAX_LINKS
                ? prev
                : { ...prev, links: [...prev.links, { label: '', url: '' }] }
        )
    }

    const removeLink = (index) => {
        setShop((prev) => ({ ...prev, links: prev.links.filter((_, i) => i !== index) }))
    }

    // Featured order = click order; a re-click removes.
    const toggleFeatured = (productId) => {
        setShop((prev) => {
            const id = String(productId)
            if (prev.featuredProductIds.includes(id)) {
                return { ...prev, featuredProductIds: prev.featuredProductIds.filter((x) => x !== id) }
            }
            if (prev.featuredProductIds.length >= MAX_FEATURED) {
                showToast(`You can feature up to ${MAX_FEATURED} products`, 'error')
                return prev
            }
            return { ...prev, featuredProductIds: [...prev.featuredProductIds, id] }
        })
    }

    // Blocks: add / move / remove / edit settings.
    const addBlock = (type) => {
        setAddMenuOpen(false)
        if (shop.blocks.length >= MAX_BLOCKS) {
            showToast(`A page holds up to ${MAX_BLOCKS} blocks`, 'error')
            return
        }
        const block = makeBlock(type)
        setOpenBlockId(block.id)
        setShop((prev) => ({ ...prev, blocks: [...prev.blocks, block] }))
    }

    const moveBlock = (index, delta) => {
        setShop((prev) => {
            const target = index + delta
            if (target < 0 || target >= prev.blocks.length) return prev
            const blocks = [...prev.blocks]
            const [item] = blocks.splice(index, 1)
            blocks.splice(target, 0, item)
            return { ...prev, blocks }
        })
    }

    const removeBlock = (index) => {
        setShop((prev) => ({ ...prev, blocks: prev.blocks.filter((_, i) => i !== index) }))
    }

    const updateBlockSettings = (index, settings) => {
        setShop((prev) => ({
            ...prev,
            blocks: prev.blocks.map((b, i) => (i === index ? { ...b, settings } : b)),
        }))
    }

    const save = async () => {
        try {
            setSaving(true)
            const payload = savePayload(shop)
            const res = await fetch('/api/user/shop', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || 'Failed to save page')
            const next = data.shop ? hydrate(data.shop) : shop
            setShop(next)
            setSavedSnapshot(JSON.stringify(savePayload(next)))
            showToast('Page saved', 'success')
        } catch (err) {
            showToast(err?.message || 'Failed to save page', 'error')
        } finally {
            setSaving(false)
        }
    }

    const shopName = displayName || user?.firstName || 'Your shop'

    // Preview identity mirrors what the public page builds server-side.
    const previewCreator = useMemo(() => ({
        id: user?.id || '',
        displayName: shopName,
        imageUrl: user?.imageUrl || null,
        role: 'Creator',
        joinedYear: user?.createdAt ? new Date(user.createdAt).getFullYear() : null,
        shop,
    }), [user, shopName, shop])

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3 flex-wrap">
                <h1 className="dash-title flex-1">My page</h1>
                {dirty && <span className="text-[12px] text-[var(--dash-ink-soft)]">Unsaved changes</span>}
                {shopHref && (
                    <Link href={shopHref} className={pillBtnCls}>
                        View page
                        <GoLinkExternal aria-hidden="true" />
                    </Link>
                )}
                <button
                    type="button"
                    onClick={save}
                    disabled={saving || !loaded}
                    className="dash-hoverable rounded-full px-4 py-2 text-[13px] font-medium bg-[var(--dash-ink)] text-[var(--dash-canvas)] cursor-pointer disabled:opacity-50 active:scale-[0.97]"
                >
                    {saving ? 'Saving...' : 'Save'}
                </button>
            </div>

            {!loaded ? (
                <div className="flex flex-col gap-2">
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-5 items-start">
                    {/* Left: builder */}
                    <div className="flex flex-col gap-4 min-w-0">
                        <ViewTabs
                            tabs={[
                                { key: 'blocks', label: 'Blocks', count: shop.blocks.length },
                                { key: 'settings', label: 'Page settings' },
                            ]}
                            active={tab}
                            onChange={setTab}
                        />

                        {tab === 'blocks' && (
                            <div className="flex flex-col gap-3">
                                <div className={`${cardCls} p-4 flex items-center justify-between gap-3`}>
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-[13px] font-medium">Published</span>
                                        <span className="text-[12px] text-[var(--dash-ink-soft)]">
                                            {shop.published ? 'Visitors can see your page.' : 'Only you can see your page.'}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={shop.published}
                                        aria-label="Published"
                                        onClick={() => setShop((prev) => ({ ...prev, published: !prev.published }))}
                                        className={`relative h-6 w-11 rounded-full border transition-colors cursor-pointer ${
                                            shop.published ? 'bg-[var(--dash-ink)] border-[var(--dash-ink)]' : 'bg-[var(--dash-canvas)] border-[var(--dash-line)]'
                                        }`}
                                    >
                                        <span
                                            aria-hidden="true"
                                            className={`absolute top-0.5 h-[18px] w-[18px] rounded-full transition-transform ${
                                                shop.published ? 'left-0.5 translate-x-5 bg-[var(--dash-canvas)]' : 'left-0.5 bg-[var(--dash-ink)]'
                                            }`}
                                        />
                                    </button>
                                </div>

                                <ol className="flex flex-col gap-2" aria-label="Page blocks">
                                    {shop.blocks.map((block, index) => {
                                        const open = openBlockId === block.id
                                        return (
                                            <li key={block.id} className={`${cardCls} overflow-hidden`}>
                                                <div className="flex items-center gap-2 px-4 py-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => setOpenBlockId(open ? null : block.id)}
                                                        aria-expanded={open}
                                                        className="flex-1 min-w-0 text-left cursor-pointer"
                                                    >
                                                        <span className="block text-[13px] font-medium">{blockLabel(block.type)}</span>
                                                        <span className="block text-[12px] text-[var(--dash-ink-soft)] truncate">{blockSummary(block)}</span>
                                                    </button>
                                                    <button type="button" aria-label={`Move block ${index + 1} up`} disabled={index === 0} onClick={() => moveBlock(index, -1)} className={iconBtnCls}>
                                                        <GoChevronUp aria-hidden="true" />
                                                    </button>
                                                    <button type="button" aria-label={`Move block ${index + 1} down`} disabled={index === shop.blocks.length - 1} onClick={() => moveBlock(index, 1)} className={iconBtnCls}>
                                                        <GoChevronDown aria-hidden="true" />
                                                    </button>
                                                    <button type="button" aria-label={`Remove block ${index + 1}`} onClick={() => removeBlock(index)} className={iconBtnCls}>
                                                        <GoTrash aria-hidden="true" />
                                                    </button>
                                                </div>
                                                {open && (
                                                    <div className="border-t border-[var(--dash-line)] px-4 py-4">
                                                        <BlockSettingsForm
                                                            block={block}
                                                            index={index}
                                                            onChange={(settings) => updateBlockSettings(index, settings)}
                                                            showToast={showToast}
                                                        />
                                                    </div>
                                                )}
                                            </li>
                                        )
                                    })}
                                </ol>

                                {shop.blocks.length === 0 && (
                                    <p className="text-[13px] text-[var(--dash-ink-soft)]">
                                        No blocks yet. Visitors will see the default layout until you add some.
                                    </p>
                                )}

                                <div className="flex flex-col gap-2">
                                    {shop.blocks.length < MAX_BLOCKS && (
                                        <button
                                            type="button"
                                            onClick={() => setAddMenuOpen((v) => !v)}
                                            aria-expanded={addMenuOpen}
                                            className={`${pillBtnCls} w-fit`}
                                        >
                                            <GoPlus aria-hidden="true" />
                                            Add block
                                        </button>
                                    )}
                                    {addMenuOpen && (
                                        <div className={`${cardCls} p-2 grid grid-cols-1 sm:grid-cols-2 gap-1`} role="menu" aria-label="Block types">
                                            {BLOCK_TYPES.map((b) => (
                                                <button
                                                    key={b.type}
                                                    type="button"
                                                    role="menuitem"
                                                    onClick={() => addBlock(b.type)}
                                                    className="dash-hoverable flex flex-col items-start gap-0.5 rounded-[var(--dash-r-inner)] px-3 py-2 text-left hover:bg-[var(--dash-canvas)] cursor-pointer"
                                                >
                                                    <span className="text-[13px] font-medium">{b.label}</span>
                                                    <span className="text-[12px] text-[var(--dash-ink-soft)]">{b.description}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <span className="dash-data dash-soft">{shop.blocks.length}/{MAX_BLOCKS} blocks</span>
                                </div>
                            </div>
                        )}

                        {tab === 'settings' && (
                            <div className="flex flex-col gap-4">
                                {/* Theme */}
                                <div className={`${cardCls} p-5 flex flex-col gap-5`}>
                                    <h2 className="dash-section">Theme</h2>
                                    <FieldRow label="Mode">
                                        <Segmented
                                            label="Theme mode"
                                            options={THEME_MODES}
                                            labels={MODE_LABELS}
                                            value={shop.theme.mode}
                                            onChange={(mode) => setShop((prev) => ({ ...prev, theme: { ...prev.theme, mode } }))}
                                        />
                                    </FieldRow>
                                    <FieldRow label="Font">
                                        <Segmented
                                            label="Theme font"
                                            options={THEME_FONTS}
                                            labels={FONT_LABELS}
                                            value={shop.theme.font}
                                            onChange={(font) => setShop((prev) => ({ ...prev, theme: { ...prev.theme, font } }))}
                                        />
                                    </FieldRow>
                                    <FieldRow label="Accent" help="Optional colour used for small highlights on your page.">
                                        <div className="flex items-center gap-2">
                                            {ACCENT_PRESETS.map((color) => (
                                                <button
                                                    key={color}
                                                    type="button"
                                                    aria-label={`Accent ${color}`}
                                                    aria-pressed={shop.accentColor === color}
                                                    onClick={() => setShop((prev) => ({ ...prev, accentColor: prev.accentColor === color ? '' : color }))}
                                                    className={`h-7 w-7 rounded-full cursor-pointer border ${shop.accentColor === color ? 'border-[var(--dash-ink)] ring-2 ring-[var(--dash-line)]' : 'border-[var(--dash-line)]'}`}
                                                    style={{ backgroundColor: color }}
                                                />
                                            ))}
                                            <button
                                                type="button"
                                                onClick={() => setShop((prev) => ({ ...prev, accentColor: '' }))}
                                                className="text-[13px] dash-soft hover:text-[var(--dash-ink)] cursor-pointer ml-1"
                                            >
                                                None
                                            </button>
                                        </div>
                                    </FieldRow>
                                </div>

                                {/* Images */}
                                <div className={`${cardCls} p-5 flex flex-col gap-5`}>
                                    <h2 className="dash-section">Images</h2>
                                    <FieldRow label="Banner" help="Wide image across the top of your page. Cropped to about 4:1. Saves immediately.">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={pickFile('banner')} aria-label="Upload banner image" />
                                            <button type="button" onClick={() => bannerInputRef.current?.click()} className={pillBtnCls}>
                                                <IoImageOutline aria-hidden="true" />
                                                {shop.bannerImage ? 'Replace banner' : 'Upload banner'}
                                            </button>
                                            {shop.bannerImage && (
                                                <button type="button" onClick={() => removeImage('banner')} className="text-[13px] dash-soft hover:text-[var(--dash-ink)] cursor-pointer">
                                                    Remove
                                                </button>
                                            )}
                                        </div>
                                    </FieldRow>
                                    <FieldRow label="Logo" help="Round logo. Cropped square; shown over the banner. Saves immediately.">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={pickFile('logo')} aria-label="Upload logo image" />
                                            <button type="button" onClick={() => logoInputRef.current?.click()} className={pillBtnCls}>
                                                <IoImageOutline aria-hidden="true" />
                                                {shop.logoImage ? 'Replace logo' : 'Upload logo'}
                                            </button>
                                            {shop.logoImage && (
                                                <button type="button" onClick={() => removeImage('logo')} className="text-[13px] dash-soft hover:text-[var(--dash-ink)] cursor-pointer">
                                                    Remove
                                                </button>
                                            )}
                                        </div>
                                    </FieldRow>
                                </div>

                                {/* About */}
                                <div className={`${cardCls} p-5 flex flex-col gap-5`}>
                                    <h2 className="dash-section">About</h2>
                                    <FieldRow label="Description" help="Shown under your name in the hero block. Plain text.">
                                        <textarea
                                            value={shop.description}
                                            maxLength={MAX_DESCRIPTION}
                                            rows={4}
                                            aria-label="Shop description"
                                            placeholder="Tell buyers what you make and why it is great."
                                            onChange={(e) => setShop((prev) => ({ ...prev, description: e.target.value }))}
                                            className="w-full rounded-[var(--dash-r-inner)] border border-[var(--dash-line)] bg-[var(--dash-card)] px-3 py-2 text-[13px] resize-y"
                                        />
                                        <span className="dash-data dash-soft self-end">{shop.description.length}/{MAX_DESCRIPTION}</span>
                                    </FieldRow>
                                    <FieldRow label={`Links (${shop.links.length}/${MAX_LINKS})`} help="Up to 6 external links, shown by the Links block.">
                                        <div className="flex flex-col gap-2">
                                            {shop.links.map((link, i) => (
                                                <div key={i} className="flex items-center gap-2">
                                                    <input
                                                        value={link.label}
                                                        maxLength={40}
                                                        placeholder="Label"
                                                        aria-label={`Link ${i + 1} label`}
                                                        onChange={(e) => updateLink(i, { label: e.target.value })}
                                                        className="w-36 rounded-[var(--dash-r-inner)] border border-[var(--dash-line)] bg-[var(--dash-card)] px-3 py-1.5 text-[13px]"
                                                    />
                                                    <input
                                                        value={link.url}
                                                        maxLength={300}
                                                        placeholder="https://example.com"
                                                        aria-label={`Link ${i + 1} URL`}
                                                        onChange={(e) => updateLink(i, { url: e.target.value })}
                                                        className="flex-1 min-w-0 rounded-[var(--dash-r-inner)] border border-[var(--dash-line)] bg-[var(--dash-card)] px-3 py-1.5 text-[13px]"
                                                    />
                                                    <button type="button" aria-label={`Remove link ${i + 1}`} onClick={() => removeLink(i)} className={iconBtnCls}>
                                                        <GoX aria-hidden="true" />
                                                    </button>
                                                </div>
                                            ))}
                                            {shop.links.length < MAX_LINKS && (
                                                <button type="button" onClick={addLink} className={`${pillBtnCls} w-fit px-3 py-1.5`}>
                                                    <GoPlus aria-hidden="true" />
                                                    Add link
                                                </button>
                                            )}
                                        </div>
                                    </FieldRow>
                                </div>

                                {/* Featured products */}
                                <div className={`${cardCls} p-5 flex flex-col gap-4`}>
                                    <div className="flex items-center justify-between gap-3">
                                        <h2 className="dash-section">Featured products</h2>
                                        <span className="dash-data dash-soft">{shop.featuredProductIds.length}/{MAX_FEATURED}</span>
                                    </div>
                                    <p className="text-[12px] text-[var(--dash-ink-soft)]">
                                        Click to feature; click again to remove. They appear in the Products block in the order you pick them.
                                    </p>
                                    {!productsLoaded ? (
                                        <div className="flex flex-col gap-2">
                                            <SkeletonRow />
                                            <SkeletonRow />
                                        </div>
                                    ) : products.length === 0 ? (
                                        <p className="text-[13px] text-[var(--dash-ink-soft)]">
                                            No products yet. Create products first, then feature your best ones here.
                                        </p>
                                    ) : (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                            {products.map((product) => {
                                                const id = String(product._id)
                                                const order = shop.featuredProductIds.indexOf(id)
                                                const selected = order >= 0
                                                const image = product.images?.[0]
                                                return (
                                                    <button
                                                        key={id}
                                                        type="button"
                                                        aria-pressed={selected}
                                                        onClick={() => toggleFeatured(id)}
                                                        className={`dash-hoverable relative flex flex-col gap-2 rounded-[var(--dash-r-inner)] border p-2 text-left cursor-pointer ${
                                                            selected
                                                                ? 'border-[var(--dash-ink)] bg-[var(--dash-canvas)]'
                                                                : 'border-[var(--dash-line)] bg-[var(--dash-card)] hover:bg-[var(--dash-canvas)]'
                                                        }`}
                                                    >
                                                        {image ? (
                                                            // eslint-disable-next-line @next/next/no-img-element
                                                            <img
                                                                src={proxySrc(image)}
                                                                alt=""
                                                                className="w-full aspect-square object-cover rounded-[var(--dash-r-inner)] border border-[var(--dash-line)]"
                                                            />
                                                        ) : (
                                                            <span aria-hidden="true" className="dash-hatch w-full aspect-square rounded-[var(--dash-r-inner)] border border-[var(--dash-line)] inline-block" />
                                                        )}
                                                        <span className="text-[12px] font-medium truncate">{product.name}</span>
                                                        {selected && (
                                                            <span className="absolute top-3 right-3 h-6 w-6 grid place-items-center rounded-full bg-[var(--dash-ink)] text-[var(--dash-canvas)] text-[11px] font-semibold">
                                                                {order + 1}
                                                            </span>
                                                        )}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right: live preview */}
                    <div className="min-w-0 lg:sticky lg:top-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="dash-label">Preview</span>
                            <span className="text-[12px] text-[var(--dash-ink-soft)]">Updates as you edit</span>
                        </div>
                        <div
                            data-testid="page-preview"
                            className={`${cardCls} overflow-hidden max-h-[80vh] overflow-y-auto`}
                        >
                            <CreatorPageFrame theme={shop.theme} accentColor={shop.accentColor} className="px-4 py-8 md:px-6">
                                <BlockRenderer blocks={shop.blocks} creator={previewCreator} products={products} preview />
                            </CreatorPageFrame>
                        </div>
                    </div>
                </div>
            )}

            {cropState && (
                <ShopImageCropModal
                    src={cropState.src}
                    aspect={cropState.kind === 'banner' ? 4 : 1}
                    circular={cropState.kind === 'logo'}
                    title={cropState.kind === 'banner' ? 'Crop banner' : 'Crop logo'}
                    busy={uploading}
                    onCancel={() => {
                        if (!uploading) {
                            URL.revokeObjectURL(cropState.src)
                            setCropState(null)
                        }
                    }}
                    onConfirm={uploadCropped}
                />
            )}
        </div>
    )
}

export default function GatedShopEditor() {
    return (
        <CreatorGate>
            <ShopEditor />
        </CreatorGate>
    )
}
