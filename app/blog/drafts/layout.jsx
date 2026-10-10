/* eslint-disable @next/next/no-html-link-for-pages -- Full document navigation preserves the isolated draft shell and avoids route prefetching. */
import styles from './drafts.module.css'

export const metadata = { robots: { index: false, follow: false } }

export default function DraftLayout({ children }) {
    return <div className={styles.shell}>
        <header className={styles.masthead}>
            <a href="/blog/drafts" className={styles.brand}>Fix It Today</a>
            <span>Journal</span>
        </header>
        <div className={styles.banner}>DRAFT — not published</div>
        {children}
        <footer className={styles.footer}>Fix It Today · Journal drafts</footer>
    </div>
}
