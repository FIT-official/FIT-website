"use client"
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import TiptapEditor from '@/components/Admin/BlogEditor/TiptapEditor'
import MetaRail from '@/components/Admin/BlogEditor/MetaRail'
import { useToast } from '@/components/General/ToastProvider'
import { toDatetimeLocal } from '@/utils/datetimeLocal'
import { settle } from '@/lib/motion/tokens'
import {
    ViewTabs,
    StatusPill,
    GlassBar,
    EmptyState,
    ConfirmDialog,
    Sheet,
    SkeletonRow,
} from '@/components/dashboard-ui'
import {
    IoArrowBackOutline, IoArrowUndoOutline, IoArrowRedoOutline,
    IoOptionsOutline, IoRefreshOutline, IoOpenOutline, IoNewspaperOutline,
} from 'react-icons/io5'


function slugify(s) {
    return s
        .toString()
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 200)
}

const EMPTY_FORM = {
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    contentJson: null,
    contentFormat: 'tiptap',
    heroImage: '',
    cta: { tag: '', text: '', url: '' },
    metaTitle: '',
    metaDescription: '',
    tags: [],
    categories: [],
    status: 'draft',
    scheduledFor: '',
    featured: false,
}

// Status vocabulary (§4.1): ok = live, hatch = pending, paper = neutral.
const STATUS_TONES = {
    published: 'ok',
    draft: 'hatch',
    hidden: 'paper',
    unlisted: 'paper',
}

const QUIET_ICON =
    'dash-hoverable flex items-center justify-center w-8 h-8 rounded-full text-[var(--dash-ink-soft)] hover:text-[var(--dash-ink)] hover:bg-[var(--dash-sun-soft)] cursor-pointer disabled:opacity-40 disabled:cursor-default'

function hasImage(form) {
    if (form.heroImage) return true
    const walk = (n) => {
        if (!n || typeof n !== 'object') return false
        if (n.type === 'image') return true
        return Array.isArray(n.content) && n.content.some(walk)
    }
    return walk(form.contentJson)
}

function postToForm(post) {
    return {
        title: post.title || '',
        slug: post.slug || '',
        excerpt: post.excerpt || '',
        content: post.content || '',
        contentJson: post.contentJson || null,
        contentFormat: 'tiptap', // the API normalizes every post to TipTap on read and write
        heroImage: post.heroImage || '',
        cta: post.cta || { tag: '', text: '', url: '' },
        metaTitle: post.metaTitle || '',
        metaDescription: post.metaDescription || '',
        tags: post.tags || [],
        categories: post.categories || [],
        status: post.status || (post.published ? 'published' : 'draft'),
        scheduledFor: post.scheduledFor ? toDatetimeLocal(post.scheduledFor) : '',
        featured: !!post.featured,
        _id: post._id,
    }
}

// GlassBar undo/redo (§5.12) — tracks the live editor's history.
function UndoRedo({ editor }) {
    const [, setTick] = useState(0)
    useEffect(() => {
        if (!editor) return undefined
        const update = () => setTick((n) => n + 1)
        editor.on('transaction', update)
        return () => { editor.off('transaction', update) }
    }, [editor])
    return (
        <div className="flex items-center gap-0.5">
            <button
                type="button"
                aria-label="Undo"
                title="Undo"
                disabled={!editor || !editor.can().undo()}
                onClick={() => editor?.chain().focus().undo().run()}
                className={QUIET_ICON}
            >
                <IoArrowUndoOutline size={15} aria-hidden />
            </button>
            <button
                type="button"
                aria-label="Redo"
                title="Redo"
                disabled={!editor || !editor.can().redo()}
                onClick={() => editor?.chain().focus().redo().run()}
                className={QUIET_ICON}
            >
                <IoArrowRedoOutline size={15} aria-hidden />
            </button>
        </div>
    )
}

// Quiet informational strip (autosave-restore banner — §5.12).
function InfoStrip({ children, actions }) {
    return (
        <div className="flex items-center justify-between gap-3 border border-[var(--dash-line)] rounded-[var(--dash-r-inner)] px-4 py-2.5">
            <p className="text-[13px] dash-soft min-w-0">{children}</p>
            {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
        </div>
    )
}

/**
 * Admin blog — paper mode (§5.12). List rail of posts (ViewTabs + StatusPill
 * vocabulary) ⇄ focus mode: the page IS the writing surface — 680 px column,
 * borderless display title, TipTap directly on paper, GlassBar chrome and a
 * MetaRail (sticky right / Sheet under 1280 px) for everything else.
 */
const PAGE_SIZE = 8

export default function BlogManagement() {
    const [posts, setPosts] = useState([]) // current page of lean list cards
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [total, setTotal] = useState(0)
    const [counts, setCounts] = useState({}) // per-status totals across all posts
    const [selected, setSelected] = useState(null)
    const [loading, setLoading] = useState(false)
    const [statusFilter, setStatusFilter] = useState('all')
    const [previewKey, setPreviewKey] = useState(0)
    const [previewOpen, setPreviewOpen] = useState(false)
    const [metaOpen, setMetaOpen] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [form, setForm] = useState(EMPTY_FORM)
    const [tagsInput, setTagsInput] = useState('')
    const [categoriesInput, setCategoriesInput] = useState('')
    const [slugTaken, setSlugTaken] = useState(false)
    const [restorableDraft, setRestorableDraft] = useState(null)
    const [restoreNonce, setRestoreNonce] = useState(0)
    const [autosavedAt, setAutosavedAt] = useState(null)
    const [editorInst, setEditorInst] = useState(null)
    const { showToast } = useToast()
    const autosaveTimer = useRef(null)
    const formRef = useRef(form)
    formRef.current = form
    // A pending autosave must not fire after the panel unmounts (tab switch).
    useEffect(() => () => clearTimeout(autosaveTimer.current), [])

    // Paginated lean list — the API never ships post bodies here; the full
    // post is fetched on select. Defaults keep refresh-after-save on the
    // current page and filter.
    const fetchList = async (pageArg = page, statusArg = statusFilter) => {
        setLoading(true)
        try {
            const params = new URLSearchParams({ page: String(pageArg), limit: String(PAGE_SIZE) })
            if (statusArg && statusArg !== 'all') params.set('status', statusArg)
            const res = await fetch(`/api/admin/blog?${params.toString()}`)
            const data = await res.json()
            if (data.ok) {
                setPosts(data.posts || [])
                setTotalPages(data.totalPages || 1)
                setTotal(data.total ?? (data.posts || []).length)
                if (data.counts) setCounts(data.counts)
                // Page fell off the end (e.g. last post on the page deleted):
                // clamp back to the last real page.
                if ((data.posts || []).length === 0 && pageArg > (data.totalPages || 1)) {
                    setPage(data.totalPages || 1)
                }
            }
        } catch (err) {
            console.error(err)
        } finally { setLoading(false) }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { fetchList(page, statusFilter) }, [page, statusFilter])

    const handleSelect = async (listPost) => {
        // List cards are lean (no content/contentJson) — load the full post
        // before entering focus mode.
        let post = listPost
        try {
            const res = await fetch(`/api/admin/blog?slug=${encodeURIComponent(listPost.slug)}`)
            const data = await res.json()
            if (!data.ok || !data.post) throw new Error(data.error || 'Load failed')
            post = data.post
        } catch (err) {
            console.error(err)
            showToast('Could not load the post', 'error')
            return
        }
        setSelected(post)
        setForm(postToForm(post))
        setTagsInput((post.tags || []).join(', '))
        setCategoriesInput((post.categories || []).join(', '))
        setSlugTaken(false)
        setAutosavedAt(null)
        setRestorableDraft(null)
        setPreviewOpen(false)
        setMetaOpen(false)
        // Autosave restore: newer snapshot than the saved post?
        try {
            const res = await fetch(`/api/admin/blog/${post._id}/draft`)
            const data = await res.json()
            if (data.ok && data.draft?.form && new Date(data.draft.updatedAt) > new Date(post.updatedAt)) {
                setRestorableDraft(data.draft)
            }
        } catch { /* non-fatal */ }
    }

    const backToList = () => {
        setSelected(null)
        setForm(EMPTY_FORM)
        setTagsInput('')
        setCategoriesInput('')
        setRestorableDraft(null)
        setAutosavedAt(null)
        setEditorInst(null)
        setPreviewOpen(false)
        setMetaOpen(false)
        setConfirmDelete(false)
    }

    const handleNew = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/admin/blog', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'Untitled Post', contentFormat: 'tiptap', status: 'draft' }),
            })
            const data = await res.json()
            if (!data.ok) throw new Error(data.error || 'Create failed')
            await fetchList()
            if (data.post) handleSelect(data.post)
        } catch (err) {
            console.error(err)
            showToast('Create failed', 'error')
        } finally {
            setLoading(false)
        }
    }

    const buildPayload = (f = formRef.current) => ({
        ...f,
        tags: (tagsInput || '').split(',').map((s) => s.trim()).filter(Boolean),
        categories: (categoriesInput || '').split(',').map((s) => s.trim()).filter(Boolean),
        slug: f.slug || (f.title ? slugify(f.title) : ''),
        scheduledFor: f.scheduledFor ? new Date(f.scheduledFor).toISOString() : null,
    })

    const handleSave = async () => {
        const payload = buildPayload()
        if (payload.status === 'published' && !hasImage(payload)) {
            showToast('Add a hero or inline image before publishing', 'error')
            return false
        }
        try {
            const res = await fetch('/api/admin/blog', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            const data = await res.json()
            if (!data.ok) throw new Error(data.error || 'Save failed')
            showToast('Saved', 'success')
            fetchList()
            if (data.post) {
                // saved: the autosave snapshot is stale now
                fetch(`/api/admin/blog/${data.post._id}/draft`, { method: 'DELETE' }).catch(() => { })
                setSelected(data.post)
                setForm(postToForm(data.post))
                setRestorableDraft(null)
            }
            setPreviewKey((k) => k + 1)
            return true
        } catch (err) {
            console.error(err)
            showToast('Save failed', 'error')
            return false
        }
    }

    const handleClone = async (post) => {
        try {
            const res = await fetch(`/api/admin/blog/${post._id}/clone`, { method: 'POST' })
            const data = await res.json()
            if (!data.ok) throw new Error(data.error || 'Clone failed')
            showToast('Cloned', 'success')
            await fetchList()
            if (data.post) handleSelect(data.post)
        } catch (err) {
            console.error(err)
            showToast('Clone failed', 'error')
        }
    }

    const handleDelete = async () => {
        if (!selected) return
        try {
            const res = await fetch('/api/admin/blog', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ _id: selected._id }),
            })
            const data = await res.json()
            if (!data.ok) throw new Error(data.error || 'Delete failed')
            showToast('Deleted', 'success')
            setConfirmDelete(false)
            backToList()
            fetchList()
        } catch (err) {
            console.error(err)
            showToast('Delete failed', 'error')
        }
    }

    // Live slug uniqueness check (debounced).
    useEffect(() => {
        const slug = form.slug
        if (!slug) { setSlugTaken(false); return }
        const t = setTimeout(async () => {
            try {
                const res = await fetch('/api/admin/blog/slug-exists', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ slug, excludeId: form._id }),
                })
                const data = await res.json()
                setSlugTaken(Boolean(data.exists))
            } catch { /* non-fatal */ }
        }, 500)
        return () => clearTimeout(t)
    }, [form.slug, form._id])

    // Debounced autosave of the in-progress form (existing posts only).
    const scheduleAutosave = useCallback(() => {
        if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
        autosaveTimer.current = setTimeout(async () => {
            const f = formRef.current
            if (!f._id) return
            try {
                const res = await fetch(`/api/admin/blog/${f._id}/draft`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ form: f }),
                })
                const data = await res.json()
                if (data.ok) setAutosavedAt(data.savedAt)
            } catch { /* non-fatal */ }
        }, 5000)
    }, [])

    const updateForm = (patch) => {
        setForm((f) => ({ ...f, ...patch }))
        scheduleAutosave()
    }

    const restoreDraft = () => {
        if (!restorableDraft?.form) return
        const f = restorableDraft.form
        setForm({ ...EMPTY_FORM, ...f })
        setTagsInput((f.tags || []).join(', '))
        setCategoriesInput((f.categories || []).join(', '))
        setRestorableDraft(null)
        setRestoreNonce((n) => n + 1) // remount the editor with restored content
        showToast('Draft restored. Save to keep it', 'success')
    }

    const previewUrl = form.slug ? `/blog/${encodeURIComponent(form.slug)}?previewKey=${previewKey}` : null

    // Server-side filtering: `posts` is already the current page of the
    // current filter; `counts` covers every post regardless of page.
    const totalAll = counts.all ?? total
    const tabs = [
        { key: 'all', label: 'All', count: counts.all ?? 0 },
        { key: 'published', label: 'Published', count: counts.published || 0 },
        { key: 'draft', label: 'Draft', count: counts.draft || 0 },
        { key: 'unlisted', label: 'Unlisted', count: counts.unlisted || 0 },
        { key: 'hidden', label: 'Hidden', count: counts.hidden || 0 },
    ]
    const changeFilter = (key) => {
        setStatusFilter(key)
        setPage(1)
    }

    const publishBlocked = form.status === 'published' && !hasImage(form)
    const saveDisabled = slugTaken || publishBlocked
    const saveDisabledReason = publishBlocked
        ? 'Add a hero or inline image before publishing'
        : slugTaken ? 'This slug is already in use' : undefined
    const ctaLabel = form.status === 'published' ? 'Publish' : 'Save'

    const metaRailProps = {
        form,
        updateForm,
        tagsInput,
        onTagsInput: setTagsInput,
        categoriesInput,
        onCategoriesInput: setCategoriesInput,
        slugTaken,
        publishBlocked,
        canDelete: Boolean(selected),
        onDelete: () => setConfirmDelete(true),
        onSave: async () => {
            const ok = await handleSave()
            if (ok) setMetaOpen(false)
        },
        saveDisabled,
        saveDisabledReason,
        saveLabel: form.status === 'published' ? 'Publish post' : 'Save post',
    }

    // ---- List rail ---------------------------------------------------------
    if (!selected) {
        return (
            <motion.div
                key="list"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={settle}
                className="p-5 md:p-8"
            >
                <div className="flex items-center justify-between gap-4">
                    <h2 className="dash-title">Blog posts</h2>
                    {totalAll > 0 && (
                        <button
                            type="button"
                            onClick={handleNew}
                            className="dash-hoverable rounded-full px-4 py-2 text-[13px] font-medium bg-[var(--dash-sun)] text-[var(--dash-ink)] hover:bg-[var(--dash-sun-deep)] active:scale-[0.97] cursor-pointer"
                        >
                            New Post
                        </button>
                    )}
                </div>
                <ViewTabs className="mt-5" tabs={tabs} active={statusFilter} onChange={changeFilter} />

                {loading && posts.length === 0 ? (
                    <div className="mt-6 flex flex-col gap-2">
                        <SkeletonRow />
                        <SkeletonRow />
                        <SkeletonRow />
                    </div>
                ) : totalAll === 0 ? (
                    <EmptyState
                        icon={<IoNewspaperOutline />}
                        title="Write Your First Post"
                        body="Posts you publish appear on the site's blog and can feed the newsletter."
                        cta="New Post"
                        onCta={handleNew}
                    />
                ) : posts.length === 0 ? (
                    <EmptyState
                        icon={<IoNewspaperOutline />}
                        title="No Posts Here"
                        body={`There are no ${statusFilter} posts right now.`}
                    />
                ) : (
                    <ul className="mt-4">
                        {posts.map((p) => {
                            const status = p.status || 'draft'
                            return (
                                <li key={p._id} className="border-b border-[var(--dash-line)] last:border-0">
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => handleSelect(p)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleSelect(p) }}
                                        className="dash-hoverable flex items-center justify-between gap-4 rounded-[var(--dash-r-inner)] px-3 py-3 cursor-pointer hover:bg-[var(--dash-sun-soft)]"
                                    >
                                        <div className="min-w-0">
                                            <p className="text-[14px] font-medium truncate">{p.title}</p>
                                            <p className="dash-data dash-soft truncate">/{p.slug}</p>
                                            {p.scheduledFor && status === 'draft' && (
                                                <p className="dash-data dash-soft">
                                                    Scheduled {new Date(p.scheduledFor).toLocaleString()}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleClone(p) }}
                                                className="text-[13px] font-medium text-[var(--dash-ink-soft)] hover:text-[var(--dash-ink)] cursor-pointer"
                                            >
                                                Clone
                                            </button>
                                            <StatusPill tone={STATUS_TONES[status] || 'hatch'}>{status}</StatusPill>
                                        </div>
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                )}

                {/* Pager: quiet pills, fixed h-8 so the row never shifts. */}
                {totalAll > 0 && totalPages > 1 && (
                    <nav aria-label="Pagination" className="mt-5 flex items-center justify-between gap-3">
                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="dash-hoverable inline-flex h-8 items-center leading-none rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] px-3.5 text-[13px] font-medium hover:bg-[var(--dash-canvas)] cursor-pointer disabled:opacity-40 disabled:cursor-default"
                        >
                            Previous
                        </button>
                        <span className="dash-data dash-soft inline-flex h-8 items-center leading-none whitespace-nowrap">
                            Page {page} of {totalPages}
                        </span>
                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages}
                            className="dash-hoverable inline-flex h-8 items-center leading-none rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] px-3.5 text-[13px] font-medium hover:bg-[var(--dash-canvas)] cursor-pointer disabled:opacity-40 disabled:cursor-default"
                        >
                            Next
                        </button>
                    </nav>
                )}
            </motion.div>
        )
    }

    // ---- Focus mode: the page being written --------------------------------
    return (
        <motion.div
            key="focus"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={settle}
            className="p-3 md:p-4"
        >
            <GlassBar className="flex-wrap">
                <button
                    type="button"
                    onClick={backToList}
                    className="dash-hoverable flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-medium text-[var(--dash-ink-soft)] hover:text-[var(--dash-ink)] hover:bg-[var(--dash-sun-soft)] cursor-pointer"
                >
                    <IoArrowBackOutline size={14} aria-hidden />
                    Posts
                </button>
                <span className="text-[13px] font-medium truncate max-w-[140px] md:max-w-[240px]">
                    {form.title || 'Untitled post'}
                </span>
                <span className="flex-1" />
                {autosavedAt && (
                    <span className="dash-data dash-soft whitespace-nowrap">
                        Autosaved {new Date(autosavedAt).toLocaleTimeString()}
                    </span>
                )}
                <UndoRedo editor={editorInst} />
                <button
                    type="button"
                    onClick={() => {
                        setPreviewKey((k) => k + 1) // always show the latest saved version
                        setPreviewOpen(true)
                    }}
                    className="dash-hoverable rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] px-3.5 py-1.5 text-[13px] font-medium hover:bg-[var(--dash-canvas)] cursor-pointer"
                >
                    Preview
                </button>
                <button
                    type="button"
                    onClick={() => setMetaOpen(true)}
                    title="Slug, cover, tags, SEO and scheduling"
                    className="dash-hoverable flex items-center gap-1.5 rounded-full border border-[var(--dash-line)] bg-[var(--dash-card)] px-3.5 py-1.5 text-[13px] font-medium hover:bg-[var(--dash-canvas)] cursor-pointer"
                >
                    <IoOptionsOutline size={14} aria-hidden />
                    Publish details
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saveDisabled}
                    title={saveDisabledReason}
                    className="dash-hoverable rounded-full px-4 py-1.5 text-[13px] font-semibold bg-[var(--dash-sun)] text-[var(--dash-ink)] hover:bg-[var(--dash-sun-deep)] active:scale-[0.97] cursor-pointer disabled:opacity-50 disabled:cursor-default"
                >
                    {ctaLabel}
                </button>
            </GlassBar>

            <div className="px-2 md:px-4 pt-6 md:pt-8 pb-4">
                <div className="min-w-0">
                    <div className="mx-auto max-w-[680px] flex flex-col gap-5">
                        {restorableDraft && (
                            <InfoStrip
                                actions={
                                    <>
                                        <button
                                            type="button"
                                            onClick={restoreDraft}
                                            className="text-[13px] font-medium text-[var(--dash-ink)] hover:underline cursor-pointer"
                                        >
                                            Restore
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setRestorableDraft(null)}
                                            className="text-[13px] dash-soft hover:text-[var(--dash-ink)] cursor-pointer"
                                        >
                                            Dismiss
                                        </button>
                                    </>
                                }
                            >
                                An unsaved autosave from {new Date(restorableDraft.updatedAt).toLocaleString()} exists.
                            </InfoStrip>
                        )}
                        <input
                            aria-label="Title"
                            placeholder="Untitled post"
                            value={form.title}
                            onChange={(e) => updateForm({ title: e.target.value })}
                            // Inline outline:none beats `.dash :focus-visible` — the page,
                            // not a ring, is the writing surface (client directive).
                            style={{ outline: 'none' }}
                            className="w-full bg-transparent border-0 outline-none text-[36px] leading-tight font-semibold tracking-[-0.02em]"
                        />

                        <TiptapEditor
                            key={`${form._id || 'new'}:${restoreNonce}`}
                            value={form.contentJson}
                            onChange={(json) => updateForm({ contentJson: json })}
                            onEditor={setEditorInst}
                        />
                    </div>
                </div>
            </div>

            {/* Publish details: guided, stepped flow in a Sheet (client directive,
                amends §5.12) — the writing surface stays clean; everything else is
                filled in through four small steps. */}
            <Sheet open={metaOpen} onClose={() => setMetaOpen(false)} side="right" label="Publish details" widthClass="max-w-[400px]">
                <div className="p-5">
                    <h3 className="dash-section mb-1">Publish details</h3>
                    <p className="text-[13px] dash-soft mb-4">
                        Four quick steps. Anything already filled in can be skipped.
                    </p>
                    <MetaRail idPrefix="sheet" {...metaRailProps} />
                </div>
            </Sheet>

            {/* Live preview: the REAL blog page (`/blog/<slug>` renders drafts for
                admins) in a full-height iframe Sheet (§5.12). */}
            <Sheet open={previewOpen} onClose={() => setPreviewOpen(false)} side="right" label="Post preview" widthClass="max-w-[min(96vw,1100px)]">
                <div className="h-full flex flex-col gap-3 p-5">
                    <div className="flex items-center justify-between gap-3 shrink-0">
                        <div>
                            <h3 className="dash-section">Live preview</h3>
                            <p className="text-[13px] dash-soft">
                                This is the real blog page as readers will see it. It shows the last save, so save first, then refresh.
                            </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            <button
                                type="button"
                                onClick={() => setPreviewKey((k) => k + 1)}
                                aria-label="Refresh preview"
                                title="Refresh preview"
                                className={QUIET_ICON}
                            >
                                <IoRefreshOutline size={15} aria-hidden />
                            </button>
                            {previewUrl && (
                                <a
                                    href={previewUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label="Open preview in new tab"
                                    title="Open preview in new tab"
                                    className={QUIET_ICON}
                                >
                                    <IoOpenOutline size={15} aria-hidden />
                                </a>
                            )}
                        </div>
                    </div>
                    {previewUrl ? (
                        <iframe
                            key={previewKey}
                            src={previewUrl}
                            title="Blog Preview"
                            className="w-full flex-1 min-h-0 rounded-[var(--dash-r-inner)] border border-[var(--dash-line)] bg-[var(--dash-card)]"
                        />
                    ) : (
                        <p className="text-[13px] dash-soft py-6 text-center">
                            Enter a slug (or save the post) to preview.
                        </p>
                    )}
                </div>
            </Sheet>

            <ConfirmDialog
                open={confirmDelete}
                onClose={() => setConfirmDelete(false)}
                onConfirm={handleDelete}
                title="Delete this post?"
                body="This permanently removes the post. This can't be undone."
                tone="bad"
                confirmLabel="Delete"
            />
        </motion.div>
    )
}
