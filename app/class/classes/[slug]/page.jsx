import Link from 'next/link'
import { notFound } from 'next/navigation'
import ClassTabs from '@/components/class/ClassTabs'
import hub from '@/components/class/ClassHub.module.css'
import classStyles from '../../class.module.css'
import { CLASSES, getClass, classModules } from '@/lib/class/catalogue'

export const dynamic = 'force-static'
export function generateStaticParams() { return CLASSES.map(item => ({ slug: item.slug })) }
export async function generateMetadata({ params }) {
  const item = getClass((await params).slug)
  if (!item) return { title: 'Class not found | FIT' }
  return { title: `${item.title} | FIT Learning Studio`, description: item.summary, alternates: { canonical: `/class/classes/${item.slug}` } }
}

export default async function ClassDetailPage({ params }) {
  const item = getClass((await params).slug)
  if (!item) notFound()
  const modules = classModules(item)
  return <main className={classStyles.hub}>
    <nav className={classStyles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><Link href="/class">Class</Link><span aria-hidden="true">/</span><span aria-current="page">{item.title}</span></nav>
    <ClassTabs current="classes" />
    <article className={hub.detail}>
      <p className={hub.tag}>{item.level} · {item.subject}</p>
      <h1>{item.title}</h1>
      <p>{item.summary}</p>
      <h2>What you will be able to do</h2>
      <ul>{item.outcomes.map(text => <li key={text}>{text}</li>)}</ul>
      <h2>In this class</h2>
      <ol className={hub.modules}>{modules.map(module => <li key={module.key} className={hub.module} data-status={module.status}>
        <div>
          <strong>{module.href ? <Link className={hub.planLink} href={module.href}>{module.title}</Link> : module.title}</strong>
          {module.note && <p>{module.note}</p>}
        </div>
        <span className={hub.status} data-status={module.status}>{module.status === 'available' ? 'Ready to open' : 'Planned, not available yet'}</span>
      </li>)}</ol>
      <h2>For teachers</h2>
      <p>{item.teacherNote}</p>
      <p><Link className={hub.planLink} href="/class/teachers">What teachers can do today →</Link></p>
    </article>
  </main>
}
