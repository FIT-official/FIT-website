import MakerTools from '@/components/MakerTools/MakerTools'
import { buildPageMetadata } from '@/lib/seo/metadata'

export const metadata = buildPageMetadata({
  title: 'Maker Tools: Filament Colour Matcher & Project Planner | FIT',
  description: 'Compare Bambu PLA Basic colour references, estimate material, keep your private manual filament inventory and plan multicolour projects with FIT.',
  path: '/maker-tools',
})
export default function MakerToolsPage() { return <MakerTools /> }
