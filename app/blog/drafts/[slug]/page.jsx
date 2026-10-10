/* eslint-disable @next/next/no-html-link-for-pages -- Full document navigation preserves the isolated draft shell and avoids route prefetching. */
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { getDraft } from '@/lib/blog/drafts'
import { requireDraftAccess } from '@/lib/blog/draftVisibility'
import styles from '../drafts.module.css'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function visibleDraft(params) {
    await requireDraftAccess()
    const { slug } = await params
    const draft = await getDraft(slug)
    if (!draft) notFound()
    return draft
}

export async function generateMetadata({ params }) {
    const draft = await visibleDraft(params)
    return {
        title: `${draft.title} | Fix It Today`,
        description: draft.excerpt,
        robots: { index: false, follow: false },
    }
}

export default async function DraftPage({ params }) {
    const draft = await visibleDraft(params)
    return <main className={styles.article}>
        <a href="/blog/drafts" className={styles.back}>← Journal drafts</a>
        <article>
            <header className={styles.articleHeader}>
                <p className={styles.eyebrow}>From the workshop</p>
                <h1>{draft.title}</h1>
                <p className={styles.byline}>{`By ${draft.author} · ${new Date(`${draft.date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })} · ${draft.readingTimeMinutes} min read`}</p>
                <p className={styles.excerpt}>{draft.excerpt}</p>
                <ul className={styles.tags} aria-label="Tags">{draft.tags.map(tag => <li key={tag}>{tag}</li>)}</ul>
            </header>
            <Image src={draft.coverImage} alt={draft.title} width={1600} height={900}
                unoptimized loading="eager" className={styles.hero} />
            <div className={`prose ${styles.body}`} dangerouslySetInnerHTML={{ __html: draft.contentHtml }} />
        </article>
    </main>
}
