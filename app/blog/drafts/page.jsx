import Image from 'next/image'
import { getDrafts } from '@/lib/blog/drafts'
import { requireDraftAccess } from '@/lib/blog/draftVisibility'
import styles from './drafts.module.css'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const metadata = {
    title: 'Journal drafts | Fix It Today',
    robots: { index: false, follow: false },
}

export default async function DraftIndex() {
    await requireDraftAccess()
    const drafts = await getDrafts()
    return <main className={styles.index}>
        <div className={styles.intro}>
            <p className={styles.eyebrow}>From the workshop</p>
            <h1>Journal drafts</h1>
            <p>Materials, practical projects and stories from Fix It Today.</p>
        </div>
        <div className={styles.grid}>
            {drafts.map(draft => <article key={draft.slug} className={styles.card}>
                <a href={`/blog/drafts/${draft.slug}`} className={styles.cardLink}>
                    <Image src={draft.coverImage} alt={draft.title} width={800} height={450}
                        unoptimized className={styles.cardImage} />
                    <div className={styles.cardText}>
                        <p className={styles.eyebrow}>{`${draft.readingTimeMinutes} min read · 10 Oct 2026`}</p>
                        <h2>{draft.title}</h2>
                        <p>{draft.excerpt}</p>
                        <span className={styles.readLink}>Read draft →</span>
                    </div>
                </a>
            </article>)}
        </div>
    </main>
}
