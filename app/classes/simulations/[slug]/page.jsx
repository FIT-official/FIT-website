import { notFound } from 'next/navigation'
import Activity from '@/components/ClassroomSimulations/Activity'
import { activities, findActivity } from '@/public/simulations/catalog'

export function generateStaticParams() { return activities.map(activity => ({ slug: activity.id })) }
export async function generateMetadata({ params }) {
  const { slug } = await params
  const activity = findActivity(slug)
  if (!activity) return { title: 'Activity not found | FIT' }
  return { title: `${activity.title} | FIT Learning Studio`, description: activity.description, alternates: { canonical: `/classes/simulations/${slug}` } }
}
export default async function SimulationActivityPage({ params }) {
  const { slug } = await params
  const activity = findActivity(slug)
  if (!activity) notFound()
  return <Activity activity={activity} />
}
