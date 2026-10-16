import { notFound } from 'next/navigation'
import Activity from '@/components/ClassroomSimulations/Activity'
import { getLiveSims, getLiveSim } from '@/lib/sims/registry'
import { simsAddToClassEnabled } from '@/lib/sims/flags'

export const dynamic = 'force-dynamic'

export function generateStaticParams() { return getLiveSims().map(activity => ({ slug: activity.id })) }
export async function generateMetadata({ params }) {
  const { slug } = await params
  const activity = getLiveSim(slug)
  if (!activity) return { title: 'Activity not found | FIT' }
  return { title: `${activity.title} | FIT Learning Studio`, description: activity.description, alternates: { canonical: `/class/simulations/${slug}` } }
}
export default async function SimulationActivityPage({ params }) {
  const { slug } = await params
  const activity = getLiveSim(slug)
  if (!activity) notFound()
  return <Activity activity={activity} addToClassEnabled={simsAddToClassEnabled()} />
}
