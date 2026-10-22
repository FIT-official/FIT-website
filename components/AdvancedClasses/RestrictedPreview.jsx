import Link from 'next/link'
import { CONTACT_EMAIL, CONTACT_HREF, RESTRICTED_NOTICE, SIGN_IN_HREF } from '@/lib/advancedClasses/config'
import styles from './RestrictedPreview.module.css'

// Public preview. The blurred backdrop is a GENERIC illustration: empty cards and bars, no text, no lesson
// content, no answer keys, no source records and no owner identity. It is decoration only (aria-hidden), and
// this is not a hidden private page: nothing private is ever sent to this component.
// Imports are limited to public-safe config on purpose; keep it that way.

const CARDS = [0, 1, 2, 3, 4, 5]

export default function RestrictedPreview({ contactHref = CONTACT_HREF, signInHref = SIGN_IN_HREF }) {
  return (
    <main className={styles.preview} aria-labelledby="advanced-classes-restricted-title">
      <div className={styles.backdrop} aria-hidden="true">
        <div className={styles.skeletonHeader}>
          <span className={styles.barWide} />
          <span className={styles.barShort} />
        </div>
        <div className={styles.skeletonGrid}>
          {CARDS.map((card) => (
            <div key={card} className={styles.skeletonCard}>
              <span className={styles.thumb} />
              <span className={styles.barWide} />
              <span className={styles.barShort} />
            </div>
          ))}
        </div>
      </div>
      <section className={styles.notice}>
        <h1 id="advanced-classes-restricted-title" className={styles.title}>Advanced Classes</h1>
        <p className={styles.message}>{RESTRICTED_NOTICE}</p>
        <div className={styles.actions}>
          <a className={styles.primary} href={contactHref}>Email {CONTACT_EMAIL}</a>
          <Link className={styles.secondary} href={signInHref}>Sign in</Link>
        </div>
      </section>
    </main>
  )
}
