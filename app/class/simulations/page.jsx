import Library from '@/components/ClassroomSimulations/Library'
import { simsAddToClassEnabled } from '@/lib/sims/flags'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Math & physics simulations | FIT Learning Studio',
  description: 'Explore original browser-playable FIT simulations and games in maths and physics.',
  alternates: { canonical: '/class/simulations' },
}
export default function SimulationLibraryPage() { return <Library addToClassEnabled={simsAddToClassEnabled()} /> }
