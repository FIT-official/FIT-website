"use client"
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import ImageUpload from '@/components/Admin/CMSFields/ImageUpload'
import { useToast } from '@/components/General/ToastProvider'
import { IoRefresh } from 'react-icons/io5'
import { MdOpenInNew } from 'react-icons/md'
import { BsPlus, BsPlusLg } from 'react-icons/bs'

const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false })

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

export default function BlogManagement() {
    const [posts, setPosts] = useState([])
    const [selected, setSelected] = useState(null)
    const [loading, setLoading] = useState(false)
    const [previewKey, setPreviewKey] = useState(Date.now())
    const [form, setForm] = useState({
        title: '',
        slug: '',
        excerpt: '',
        content: '',
        heroImage: '',
        cta: { tag: '', text: '', url: '' },
        metaTitle: '',
        metaDescription: '',
        tags: [],
        published: false,
        featured: false,
    })
    const [tagsInput, setTagsInput] = useState('')
    const { showToast } = useToast()

    const fetchList = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/admin/blog')
            const data = await res.json()
            if (data.ok) setPosts(data.posts || [])
        } catch (err) {
            console.error(err)
        } finally { setLoading(false) }
    }

    useEffect(() => { fetchList() }, [])

    const handleSelect = (post) => {
        setSelected(post)
        setForm({
            title: post.title || '',
            slug: post.slug || '',
            excerpt: post.excerpt || '',
            content: post.content || '',
            heroImage: post.heroImage || '',
            cta: post.cta || { tag: '', text: '', url: '' },
            metaTitle: post.metaTitle || '',
            metaDescription: post.metaDescription || '',
            tags: post.tags || [],
            published: !!post.published,
            featured: !!post.featured,
            _id: post._id
        })
        setTagsInput((post.tags || []).join(', '))
    }

    const handleNew = async () => {

        setLoading(true)
        try {
            const payload = { title: 'Untitled Post' }
            const res = await fetch('/api/admin/blog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            const data = await res.json()
            if (!data.ok) throw new Error(data.error || 'Create failed')

            await fetchList()
            if (data.post) {
                handleSelect(data.post)
                setPreviewKey(Date.now())
            } else {
                setSelected(null)
                setForm({ title: '', slug: '', excerpt: '', content: '', heroImage: '', cta: { tag: '', text: '', url: '' }, metaTitle: '', metaDescription: '', tags: [], published: false, featured: false })
                setTagsInput('')
            }
        } catch (err) {
            console.error(err)
            showToast('Create failed', 'error')
            // Fallback to empty form
            setSelected(null)
            setForm({ title: '', slug: '', excerpt: '', content: '', heroImage: '', cta: { tag: '', text: '', url: '' }, metaTitle: '', metaDescription: '', tags: [], published: false, featured: false })
            setTagsInput('')
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async () => {
        try {
            const payload = { ...form }
            payload.tags = (tagsInput || '').split(',').map(s => s.trim()).filter(Boolean)
            if (!payload.slug && payload.title) payload.slug = slugify(payload.title)
            const res = await fetch('/api/admin/blog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            const data = await res.json()
            if (!data.ok) throw new Error(data.error || 'Save failed')
            showToast('Saved', 'success')
            fetchList()
            if (data.post) handleSelect(data.post)
            setPreviewKey(Date.now())
        } catch (err) {
            console.error(err)
            showToast('Save failed', 'error')
        }
    }

    const handleDelete = async () => {
        if (!selected) return
        if (!confirm('Delete this post?')) return
        try {
            const res = await fetch('/api/admin/blog', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _id: selected._id }) })
            const data = await res.json()
            if (!data.ok) throw new Error(data.error || 'Delete failed')
            showToast('Deleted', 'success')
            handleNew()
            fetchList()
        } catch (err) {
            console.error(err)
            showToast('Delete failed', 'error')
        }
    }

    const previewUrl = form.slug ? `/blog/${encodeURIComponent(form.slug)}?previewKey=${previewKey}` : null

    return (
        <div className='flex gap-4 flex-col p-12 bg-borderColor/60'>
            <div className='flex flex-col md:flex-row gap-6 min-h-[70vh]'>
                <div className="w-full md:w-1/3 adminDashboardContainer overflow-auto">
                    <div className="flex justify-between items-center mb-3">
                        <h3>Blog Posts</h3>
                        <button onClick={handleNew} className="px-3 py-2 border border-borderColor rounded text-xs hover:bg-baseColor transition flex items-center gap-1 cursor-pointer">
                            <BsPlusLg />
                        </button>
                    </div>
                    {loading && <div>Loading...</div>}
                    <ul className="flex gap-2 flex-col w-full max-h-[40vh] overflow-y-auto">
                        {posts.map(p => (
                            <li key={p._id} className={`p-4 border border-borderColor w-full rounded cursor-pointer hover:text-textColor/80 transition-colors duration-100 ease-in-out  ${selected && selected._id === p._id ? '' : 'bg-borderColor/40 text-lightColor'}`} onClick={() => handleSelect(p)}>
                                <div className="font-medium text-sm truncate">{p.title}</div>
                                <div className="text-xs text-lightColor truncate">{p.slug}</div>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="adminDashboardContainer w-full flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <div className='flex flex-col gap-2'>
                            <label className="formLabel">Title</label>
                            <input className="formInput" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                        </div>
                        <div className='flex flex-col gap-2'>
                            <label className="formLabel">Slug</label>
                            <input className="formInput" value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="auto-generated from title" />
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 mb-4">
                        <label className="formLabel">Excerpt</label>
                        <input className="formInput" value={form.excerpt} onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))} />
                    </div>

                    <div className="flex flex-col gap-2 mb-4">
                        <ImageUpload label="Hero Image" value={form.heroImage} onChange={(v) => setForm(f => ({ ...f, heroImage: v }))} uploadPath={'blog'} uploadEndpoint={'/api/admin/upload/images'} />
                    </div>

                    <div className="flex flex-col gap-2 mb-4">
                        <label className="formLabel mb-2">Content</label>
                        <div data-color-mode="light">
                            <MDEditor value={form.content} onChange={(v) => setForm(f => ({ ...f, content: v }))} height={300} />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-4">
                        <div className='flex flex-col gap-2'>
                            <label className="formLabel">CTA Tag</label>
                            <input className="formInput" value={form.cta.tag} onChange={e => setForm(f => ({ ...f, cta: { ...f.cta, tag: e.target.value } }))} />
                        </div>
                        <div className='flex flex-col gap-2'>
                            <label className="formLabel">CTA Text</label>
                            <input className="formInput" value={form.cta.text} onChange={e => setForm(f => ({ ...f, cta: { ...f.cta, text: e.target.value } }))} />
                        </div>
                        <div className='flex flex-col gap-2'>
                            <label className="formLabel">CTA URL</label>
                            <input className="formInput" value={form.cta.url} onChange={e => setForm(f => ({ ...f, cta: { ...f.cta, url: e.target.value } }))} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <div className='flex flex-col gap-2'>
                            <label className="formLabel">Meta Title</label>
                            <input className="formInput" value={form.metaTitle} onChange={e => setForm(f => ({ ...f, metaTitle: e.target.value }))} placeholder="Optional SEO title" />
                        </div>
                        <div className='flex flex-col gap-2'>
                            <label className="formLabel">Meta Description</label>
                            <input className="formInput" value={form.metaDescription} onChange={e => setForm(f => ({ ...f, metaDescription: e.target.value }))} placeholder="Optional SEO description" />
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 mb-4">
                        <label className="formLabel">Tags (comma separated)</label>
                        <input
                            className="formInput"
                            value={tagsInput}
                            onChange={e => setTagsInput(e.target.value)}
                            onBlur={() => setForm(f => ({ ...f, tags: tagsInput.split(',').map(s => s.trim()).filter(Boolean) }))}
                            placeholder="e.g. design, tutorial, printing"
                        />
                    </div>

                    <div className="flex items-center gap-2 mb-6">
                        <label className="flex items-center gap-2 font-normal text-sm"><input type="checkbox" checked={form.published} onChange={e => setForm(f => ({ ...f, published: e.target.checked }))} /> Published</label>

                        <label className="flex items-center gap-2 font-normal text-sm"><input type="checkbox" checked={form.featured} onChange={e => setForm(f => ({ ...f, featured: e.target.checked }))} /> Featured</label>
                    </div>

                    <div className="flex gap-2">
                        <button onClick={handleSave} className="formBlackButton">{loading ? 'Saving...' : 'Save'}</button>
                        {selected && <button onClick={handleDelete} className="formRedButton">Delete</button>}
                    </div>
                </div>
            </div>

            <div className="adminDashboardContainer mt-2">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h3 className="font-semibold">Preview</h3>
                        <p className="text-xs text-gray-600">This shows how the blog post will look on the site. Save changes, then refresh the preview.</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setPreviewKey(Date.now())} className="formButton" type="button"><IoRefresh /></button>
                        <a href={previewUrl || '#'} target="_blank" rel="noreferrer" className="formBlackButton"><MdOpenInNew /></a>
                    </div>
                </div>
                <div className="relative w-full border border-dashed border-borderColor rounded-md overflow-hidden bg-gray-50">
                    {previewUrl ? (
                        <iframe key={previewKey} src={previewUrl} title="Blog Preview" className="w-full" style={{ height: 600, border: '0' }} />
                    ) : (
                        <div className="p-6 text-xs font-medium text-lightColor">Enter a slug (or save the post) to preview.</div>
                    )}
                </div>
            </div>

        </div>
    )
}
