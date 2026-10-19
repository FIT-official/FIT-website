import Link from 'next/link'
import ClassTabs from '@/components/class/ClassTabs'
import hub from '@/components/class/ClassHub.module.css'
import classStyles from '../class.module.css'

export const metadata = {
  title: 'For teachers | FIT Learning Studio',
  description: 'What teachers can do with FIT classes and simulations today, and what is planned next.',
  alternates: { canonical: '/class/teachers' },
}

export default function TeachersPage() {
  return <main className={classStyles.hub}>
    <nav className={classStyles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><Link href="/class">Class</Link><span aria-hidden="true">/</span><span aria-current="page">For teachers</span></nav>
    <ClassTabs current="classes" />
    <article className={hub.detail}>
      <h1>For teachers</h1>
      <p>Here is what works today and what does not exist yet. Nothing on this page creates a class or issues a join code.</p>
      <h2>Works today</h2>
      <ul className={hub.teacherSteps}>
        <li><strong>Teacher console</strong><p>Sign in with your FIT teacher account to run the design thinking workshop: settings, student work and feedback. Access is decided by the server, not by this page.</p><Link className={hub.planLink} href="/sign-in?redirect_url=%2Fadmin%2Fworkshop">Sign in to the console →</Link></li>
        <li><strong>Add simulations to your class</strong><p>When the feature is switched on for the workshop, signed-in teachers can add a simulation from the library to their class.</p><Link className={hub.planLink} href="/class/simulations">Open the simulation library →</Link></li>
        <li><strong>Use a simulation in your own content</strong><p>Each simulation page has a copyable player snippet for a same-site embed.</p></li>
      </ul>
      <h2>Planned, not available yet</h2>
      <ul className={hub.modules}>
        <li className={hub.module} data-status="planned"><div><strong>Create a live class and share a code</strong><p>Students would join the same session with a code. This needs server-side sessions, code expiry and rate limits, which are not built. The code box on the Class page does not join anything.</p></div><span className={hub.status} data-status="planned">Planned, not available yet</span></li>
        <li className={hub.module} data-status="planned"><div><strong>Phone control of slides, chat, music and pop-up questions</strong><p>Not built.</p></div><span className={hub.status} data-status="planned">Planned, not available yet</span></li>
        <li className={hub.module} data-status="planned"><div><strong>Your own questions and quizzes</strong><p>Not built. AI-generated quizzes are deferred.</p></div><span className={hub.status} data-status="planned">Planned, not available yet</span></li>
      </ul>
    </article>
  </main>
}
