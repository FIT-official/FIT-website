import Link from 'next/link'
import styles from './ResearchProjects.module.css'

// One neutral notice for every denial. It never mentions which project was requested, whether it
// exists, or what the library contains.
const COPY = {
  401: { title: 'Sign in to continue', body: 'The research project library is for signed-in class members. Sign in with your class account to open it.', action: true },
  403: { title: 'This library is not available for your account', body: 'You are signed in, but this account has not been added to a class that can use the library. If you think this is a mistake, ask your teacher.', action: false },
  503: { title: 'The library is temporarily unavailable', body: 'We could not check your access just now. Please try again in a moment.', action: false },
}

export default function AccessNotice({ status }) {
  const copy = COPY[status] || COPY[403]
  return (
    <main className={styles.library}>
      <div className={styles.notice} role="alert">
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        {copy.action ? <p><Link className={styles.primaryLink} href="/sign-in">Sign in</Link></p> : null}
      </div>
    </main>
  )
}
