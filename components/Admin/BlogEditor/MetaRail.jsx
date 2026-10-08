'use client'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { swap } from '@/lib/motion/tokens'
import { DottedRow } from '@/components/dashboard-ui'
import ImageUpload from '@/components/Admin/CMSFields/ImageUpload'

const INPUT =
    'w-full rounded-[var(--dash-r-inner)] border border-[var(--dash-line)] bg-[var(--dash-card)] px-3 py-2 text-[13px] outline-none'

function Field({ id, label, trailing, children }) {
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
                <label htmlFor={id} className="dash-label">{label}</label>
                {trailing}
            </div>
            {children}
        </div>
    )
}

// Status vocabulary for step completeness (§4.8 #14): ink = complete,
// hatch = still to do, bad = needs a fix before publishing.
function StepDot({ state }) {
    if (state === 'bad') {
        return <span className="w-2 h-2 rounded-full bg-[var(--dash-bad)] shrink-0" aria-hidden="true" />
    }
    if (state === 'done') {
        return <span className="w-2 h-2 rounded-full bg-[var(--dash-ink)] shrink-0" aria-hidden="true" />
    }
    return <span className="w-2 h-2 rounded-full border border-[var(--dash-ink-faint)] dash-hatch shrink-0" aria-hidden="true" />
}

const STEPS = [
    {
        key: 'basics',
        title: 'Basics',
        help: 'The web address of the post and the short summary shown in post lists.',
    },
    {
        key: 'cover',
        title: 'Cover and CTA',
        help: 'The cover image readers see first, plus an optional call to action shown with the post.',
    },
    {
        key: 'seo',
        title: 'Tags and SEO',
        help: 'Help readers and search engines find this post. Everything here is optional.',
    },
    {
        key: 'publish',
        title: 'Schedule and publish',
        help: 'Check the summary, then choose how and when the post goes live.',
    },
]

/**
 * The "Publish details" stepped flow (client directive, amends §5.12): every
 * field that is not the writing itself, filled in through four small numbered
 * steps with Back/Next and a summary at the end. Steps that are already fine
 * can simply be skipped through, or jumped to from the step list.
 */
export default function MetaRail({
    idPrefix = 'meta',
    form,
    updateForm,
    tagsInput,
    onTagsInput,
    categoriesInput,
    onCategoriesInput,
    slugTaken,
    publishBlocked,
    canDelete,
    onDelete,
    onSave,
    saveDisabled,
    saveDisabledReason,
    saveLabel = 'Save post',
}) {
    const [step, setStep] = useState(0)
    const id = (name) => `${idPrefix}-${name}`
    const current = STEPS[step]

    const hasSeo = Boolean(
        form.metaTitle || form.metaDescription || (tagsInput || '').trim() || (categoriesInput || '').trim()
    )
    const stepStates = {
        basics: slugTaken ? 'bad' : form.slug ? 'done' : 'todo',
        cover: form.heroImage ? 'done' : 'todo',
        seo: hasSeo ? 'done' : 'todo',
        publish: publishBlocked ? 'bad' : 'done',
    }

    const slugState = form.slug
        ? (slugTaken
            ? <span className="w-2 h-2 rounded-full bg-[var(--dash-bad)]" aria-hidden="true" />
            : <span className="w-2 h-2 rounded-full bg-[var(--dash-ok)]" aria-hidden="true" />)
        : null

    const notSet = <span className="dash-soft">Not set</span>
    const listCount = (raw, noun) => {
        const n = (raw || '').split(',').map((s) => s.trim()).filter(Boolean).length
        return n === 0 ? <span className="dash-soft">None</span> : `${n} ${noun}${n === 1 ? '' : 's'}`
    }

    return (
        <div className="flex flex-col gap-5">
            {/* Step list: always visible so any step can be jumped to. */}
            <ol className="flex flex-col gap-1" aria-label="Publish details steps">
                {STEPS.map((s, i) => (
                    <li key={s.key}>
                        <button
                            type="button"
                            onClick={() => setStep(i)}
                            aria-current={i === step ? 'step' : undefined}
                            className={`dash-hoverable w-full flex items-center gap-2.5 rounded-full px-2.5 py-1.5 text-left text-[13px] cursor-pointer ${
                                i === step
                                    ? 'bg-[var(--dash-sun-soft)] font-semibold'
                                    : 'text-[var(--dash-ink-soft)] hover:text-[var(--dash-ink)] hover:bg-[var(--dash-canvas)]'
                            }`}
                        >
                            <span
                                className={`flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-semibold shrink-0 ${
                                    i === step
                                        ? 'bg-[var(--dash-ink)] text-[var(--dash-canvas)]'
                                        : 'border border-[var(--dash-line)] text-[var(--dash-ink-soft)]'
                                }`}
                                aria-hidden="true"
                            >
                                {i + 1}
                            </span>
                            <span className="flex-1 min-w-0 truncate">{s.title}</span>
                            <StepDot state={stepStates[s.key]} />
                        </button>
                    </li>
                ))}
            </ol>

            {/* Current step: fade only (§4.5 swap), no mode="wait". */}
            <motion.div
                key={current.key}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={swap}
                className="flex flex-col gap-5"
            >
                <div className="flex flex-col gap-1">
                    <p className="dash-label">Step {step + 1} of {STEPS.length}</p>
                    <h4 className="dash-section">{current.title}</h4>
                    <p className="text-[13px] dash-soft">{current.help}</p>
                </div>

                {current.key === 'basics' && (
                    <>
                        <Field id={id('slug')} label="Slug" trailing={slugState}>
                            <input
                                id={id('slug')}
                                className={INPUT}
                                value={form.slug}
                                onChange={(e) => updateForm({ slug: e.target.value })}
                                placeholder="auto-generated from title"
                            />
                            <p className="text-[11px] dash-soft">The post lives at /blog/{form.slug || 'your-slug'}.</p>
                            {slugTaken && (
                                <p className="text-[11px] font-medium text-[var(--dash-bad)]">This slug is already in use.</p>
                            )}
                        </Field>
                        <Field id={id('excerpt')} label="Excerpt">
                            <textarea
                                id={id('excerpt')}
                                rows={3}
                                className={`${INPUT} resize-y`}
                                value={form.excerpt}
                                onChange={(e) => updateForm({ excerpt: e.target.value })}
                                placeholder="One or two sentences shown in the blog list"
                            />
                        </Field>
                    </>
                )}

                {current.key === 'cover' && (
                    <>
                        <ImageUpload
                            label="Hero Image"
                            value={form.heroImage}
                            onChange={(v) => updateForm({ heroImage: v })}
                            uploadPath={'blog'}
                            uploadEndpoint={'/api/admin/upload/images'}
                        />
                        <p className="text-[11px] dash-soft">
                            A hero or inline image is required before the post can be published.
                        </p>
                        <Field id={id('cta-tag')} label="CTA Tag">
                            <input
                                id={id('cta-tag')}
                                className={INPUT}
                                value={form.cta.tag}
                                onChange={(e) => updateForm({ cta: { ...form.cta, tag: e.target.value } })}
                                placeholder="e.g. New service"
                            />
                        </Field>
                        <Field id={id('cta-text')} label="CTA Text">
                            <input
                                id={id('cta-text')}
                                className={INPUT}
                                value={form.cta.text}
                                onChange={(e) => updateForm({ cta: { ...form.cta, text: e.target.value } })}
                                placeholder="e.g. Get an instant quote"
                            />
                        </Field>
                        <Field id={id('cta-url')} label="CTA URL">
                            <input
                                id={id('cta-url')}
                                className={INPUT}
                                value={form.cta.url}
                                onChange={(e) => updateForm({ cta: { ...form.cta, url: e.target.value } })}
                                placeholder="e.g. /editor"
                            />
                        </Field>
                    </>
                )}

                {current.key === 'seo' && (
                    <>
                        <Field
                            id={id('meta-title')}
                            label="Meta Title"
                            trailing={<span className="dash-data dash-soft">{(form.metaTitle || '').length}/60</span>}
                        >
                            <input
                                id={id('meta-title')}
                                className={INPUT}
                                value={form.metaTitle}
                                onChange={(e) => updateForm({ metaTitle: e.target.value })}
                                placeholder="Optional SEO title"
                            />
                        </Field>
                        <Field
                            id={id('meta-description')}
                            label="Meta Description"
                            trailing={<span className="dash-data dash-soft">{(form.metaDescription || '').length}/160</span>}
                        >
                            <textarea
                                id={id('meta-description')}
                                rows={2}
                                className={`${INPUT} resize-y`}
                                value={form.metaDescription}
                                onChange={(e) => updateForm({ metaDescription: e.target.value })}
                                placeholder="Optional SEO description"
                            />
                        </Field>
                        <Field id={id('tags')} label="Tags (comma separated)">
                            <input
                                id={id('tags')}
                                className={INPUT}
                                value={tagsInput}
                                onChange={(e) => onTagsInput(e.target.value)}
                                placeholder="e.g. design, tutorial, printing"
                            />
                        </Field>
                        <Field id={id('categories')} label="Categories (comma separated)">
                            <input
                                id={id('categories')}
                                className={INPUT}
                                value={categoriesInput}
                                onChange={(e) => onCategoriesInput(e.target.value)}
                                placeholder="e.g. guides, news"
                            />
                        </Field>
                    </>
                )}

                {current.key === 'publish' && (
                    <>
                        <label className="flex items-center gap-2 text-[13px] font-medium cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.featured}
                                onChange={(e) => updateForm({ featured: e.target.checked })}
                                className="accent-[var(--dash-ink)]"
                            />
                            Featured post
                        </label>

                        <Field id={id('status')} label="Status">
                            <select
                                id={id('status')}
                                className={`${INPUT} cursor-pointer`}
                                value={form.status}
                                onChange={(e) => updateForm({ status: e.target.value })}
                            >
                                <option value="draft">Draft</option>
                                <option value="published">Published</option>
                                <option value="unlisted">Unlisted (link only, noindex)</option>
                                <option value="hidden">Hidden</option>
                            </select>
                            {publishBlocked && (
                                <p className="text-[11px] font-medium text-[var(--dash-bad)]">
                                    Add a hero or inline image before publishing.
                                </p>
                            )}
                        </Field>

                        <Field id={id('schedule')} label="Schedule publish (drafts)">
                            <input
                                id={id('schedule')}
                                type="datetime-local"
                                className={INPUT}
                                value={form.scheduledFor}
                                onChange={(e) => updateForm({ scheduledFor: e.target.value })}
                                disabled={form.status === 'published'}
                            />
                            <p className="text-[11px] dash-soft">
                                Drafts with a schedule go live automatically at that time.
                            </p>
                        </Field>

                        <div className="flex flex-col gap-0.5 border-t border-[var(--dash-line)] pt-4">
                            <p className="dash-label mb-1.5">Summary</p>
                            <DottedRow label="Slug">{form.slug ? `/${form.slug}` : notSet}</DottedRow>
                            <DottedRow label="Excerpt">{form.excerpt ? 'Set' : notSet}</DottedRow>
                            <DottedRow label="Cover image">{form.heroImage ? 'Added' : notSet}</DottedRow>
                            <DottedRow label="CTA">{form.cta.text || form.cta.url ? 'Set' : notSet}</DottedRow>
                            <DottedRow label="SEO title">{form.metaTitle ? 'Set' : <span className="dash-soft">Uses post title</span>}</DottedRow>
                            <DottedRow label="Tags">{listCount(tagsInput, 'tag')}</DottedRow>
                            <DottedRow label="Categories">{listCount(categoriesInput, 'category')}</DottedRow>
                            <DottedRow label="Featured">{form.featured ? 'Yes' : 'No'}</DottedRow>
                            <DottedRow label="Status">{form.status}</DottedRow>
                            <DottedRow label="Scheduled">
                                {form.scheduledFor && form.status !== 'published'
                                    ? new Date(form.scheduledFor).toLocaleString()
                                    : 'No'}
                            </DottedRow>
                        </div>
                    </>
                )}
            </motion.div>

            {/* Back / Next, then the save action on the final step. */}
            <div className="flex items-center justify-between gap-2 border-t border-[var(--dash-line)] pt-4">
                <button
                    type="button"
                    onClick={() => setStep((s) => Math.max(0, s - 1))}
                    disabled={step === 0}
                    className="dash-hoverable rounded-full px-4 py-2 text-[13px] font-medium border border-[var(--dash-line)] bg-[var(--dash-card)] hover:bg-[var(--dash-canvas)] cursor-pointer disabled:opacity-40 disabled:cursor-default"
                >
                    Back
                </button>
                {step < STEPS.length - 1 ? (
                    <button
                        type="button"
                        onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                        className="dash-hoverable rounded-full px-4 py-2 text-[13px] font-medium bg-[var(--dash-ink)] text-[var(--dash-canvas)] active:scale-[0.97] cursor-pointer"
                    >
                        Next
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={saveDisabled}
                        title={saveDisabledReason}
                        className="dash-hoverable rounded-full px-4 py-2 text-[13px] font-semibold bg-[var(--dash-sun)] text-[var(--dash-ink)] hover:bg-[var(--dash-sun-deep)] active:scale-[0.97] cursor-pointer disabled:opacity-50 disabled:cursor-default"
                    >
                        {saveLabel}
                    </button>
                )}
            </div>

            {canDelete && step === STEPS.length - 1 && (
                <button
                    type="button"
                    onClick={onDelete}
                    className="dash-hoverable w-full rounded-full border border-[var(--dash-line)] px-4 py-2 text-[13px] font-medium text-[var(--dash-bad)] hover:bg-[var(--dash-bad-bg)] cursor-pointer"
                >
                    Delete post
                </button>
            )}
        </div>
    )
}
