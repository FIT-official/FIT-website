import Library from '@/components/ClassroomSimulations/Library'
import { simsAddToClassEnabled } from '@/lib/sims/flags'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Math & physics simulations | FIT Learning Studio',
  description: 'Explore four original browser-playable FIT activities in sampling, feedback control, probability and heat flow.',
  alternates: { canonical: '/classes/simulations' },
}
export default function SimulationLibraryPage() { return <Library addToClassEnabled={simsAddToClassEnabled()} /> }
