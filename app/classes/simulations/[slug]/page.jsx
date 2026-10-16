import { notFound } from 'next/navigation'
import Activity from '@/components/ClassroomSimulations/Activity'
import { getLiveSims, getLiveSim } from '@/lib/sims/registry'

export function generateStaticParams() { return getLiveSims().map(activity => ({ slug: activity.id })) }
export async function generateMetadata({ params }) {
  const { slug } = await params
  const activity = getLiveSim(slug)
  if (!activity) return { title: 'Activity not found | FIT' }
  return { title: `${activity.title} | FIT Learning Studio`, description: activity.description, alternates: { canonical: `/classes/simulations/${slug}` } }
}
export default async function SimulationActivityPage({ params }) {
  const { slug } = await params
  const activity = getLiveSim(slug)
  if (!activity) notFound()
  return <Activity activity={activity} />
}
