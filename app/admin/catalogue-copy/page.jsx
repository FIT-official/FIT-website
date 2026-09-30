import Link from 'next/link'
import CatalogueCopy from './CatalogueCopy'

export const metadata = { title: 'Catalogue descriptions', robots: { index: false, follow: false } }

export default function CatalogueCopyPage() {
    return <main className="mx-auto max-w-3xl space-y-6 px-6 py-12 text-textColor">
        <Link href="/admin/store-checks" className="text-sm underline">Back to store checks</Link>
        <h1>Catalogue descriptions</h1>
        <p className="text-sm leading-relaxed text-lightColor">Remove numbered quotation references and old delivery test notes from shop listings. Product specifications, photo credits, prices and stock stay unchanged. The original text is saved privately before cleanup.</p>
        <CatalogueCopy />
    </main>
}
