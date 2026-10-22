// Everything under /class/projects is per-user and private: rendered on demand for each request,
// never statically generated, and kept out of search indexes and shared caches.
export const dynamic = 'force-dynamic'

// Deliberately generic: no project names or descriptions appear in metadata, so nothing about the
// library is exposed to a visitor who has not been authorised.
export const metadata = {
  title: 'Advanced Classes | FIT',
  robots: { index: false, follow: false, nocache: true, noarchive: true, nosnippet: true },
}

export default function ProjectsLayout({ children }) {
  return children
}
