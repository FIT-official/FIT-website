import Link from 'next/link'
import { notFound } from 'next/navigation'
import { computingFlag } from '@/lib/computing/flags'
import { buildPageMetadata } from '@/lib/seo/metadata'

export const metadata = buildPageMetadata({
  title: 'Computing | FIT Learning Studio',
  description: 'Write and run code in your browser. Nothing to install.',
  path: '/computing',
})

export default function ComputingPage() {
  if (!computingFlag('COMPUTING_ENABLED')) {
    notFound()
  }

  const blocksEnabled = computingFlag('COMPUTING_BLOCKS_ENABLED')

  return (
    <main
      className="min-h-screen bg-[#FEFEFE] px-4 py-8 text-[#111] sm:px-6 sm:py-12 lg:px-8"
      style={{
        fontFamily: 'Inter, system-ui, sans-serif',
        touchAction: 'manipulation',
      }}
    >
      <div className="mx-auto w-full max-w-6xl">
        <nav
          aria-label="Breadcrumb"
          className="mb-8 flex flex-wrap items-center gap-3 text-sm font-medium"
        >
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-xl px-2 hover:underline focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#1F66E5]"
            style={{
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            Home
          </Link>

          <span aria-hidden="true">/</span>

          <Link
            href="/class"
            className="inline-flex min-h-11 items-center rounded-xl px-2 hover:underline focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#1F66E5]"
            style={{
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            Class
          </Link>

          <span aria-hidden="true">/</span>

          <span
            aria-current="page"
            className="inline-flex min-h-11 items-center"
          >
            Computing
          </span>
        </nav>

        <header className="mb-10">
          <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.16em] sm:text-sm">
            FIT LEARNING STUDIO
          </p>

          <h1 className="mb-4 text-4xl font-black tracking-tight sm:text-5xl">
            Computing
          </h1>

          <p className="max-w-2xl text-lg leading-relaxed sm:text-xl">
            Write and run code in your browser. Nothing to install.
          </p>
        </header>

        <section aria-labelledby="computing-tools-heading">
          <h2
            id="computing-tools-heading"
            className="mb-5 text-2xl font-extrabold"
          >
            Explore Computing
          </h2>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Link
              href="/computing/code"
              aria-labelledby="code-lab-heading"
              aria-describedby="code-lab-description"
              className="group flex min-h-56 flex-col justify-between rounded-[24px] border-2 border-[#111] bg-white p-6 shadow-[0_4px_0_#111] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#1F66E5] active:translate-y-0 sm:p-8"
              style={{
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
              }}
            >
              <div>
                <p className="mb-4 text-xs font-extrabold uppercase tracking-widest">
                  WRITE AND RUN
                </p>

                <h3
                  id="code-lab-heading"
                  className="mb-3 text-2xl font-black"
                >
                  Code Lab
                </h3>

                <p
                  id="code-lab-description"
                  className="max-w-sm leading-relaxed"
                >
                  Write, edit and run code in a browser-based workspace.
                  Practise programming and see your results.
                </p>
              </div>

              <span
                className="mt-8 inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-full border-2 border-[#111] bg-[#FFC83D] px-5 py-2 text-sm font-extrabold shadow-[0_4px_0_#111] group-hover:bg-[#ffe083]"
              >
                Open Code Lab
                <span aria-hidden="true">↗</span>
              </span>
            </Link>

            {blocksEnabled && (
              <Link
                href="/computing/blocks"
                aria-labelledby="blocks-heading"
                aria-describedby="blocks-description"
                className="group flex min-h-56 flex-col justify-between rounded-[24px] border-2 border-[#111] bg-white p-6 shadow-[0_4px_0_#111] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#1F66E5] active:translate-y-0 sm:p-8"
                style={{
                  WebkitTapHighlightColor: 'transparent',
                  touchAction: 'manipulation',
                }}
              >
                <div>
                  <p className="mb-4 text-xs font-extrabold uppercase tracking-widest">
                    BUILD AND EXPLORE
                  </p>

                  <h3
                    id="blocks-heading"
                    className="mb-3 text-2xl font-black"
                  >
                    Blocks
                  </h3>

                  <p
                    id="blocks-description"
                    className="max-w-sm leading-relaxed"
                  >
                    Build programs using blocks. Explore sequences,
                    decisions and repetition without typing every instruction.
                  </p>
                </div>

                <span
                  className="mt-8 inline-flex min-h-11 w-fit items-center justify-center gap-2 rounded-full border-2 border-[#111] bg-[#FFC83D] px-5 py-2 text-sm font-extrabold shadow-[0_4px_0_#111] group-hover:bg-[#ffe083]"
                >
                  Open Blocks
                  <span aria-hidden="true">↗</span>
                </span>
              </Link>
            )}
          </div>
        </section>

        <div className="mt-10">
          <Link
            href="/class"
            className="inline-flex min-h-11 items-center rounded-full border-2 border-[#111] bg-white px-5 py-2 font-bold shadow-[0_4px_0_#111] hover:bg-[#FFC83D] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#1F66E5]"
            style={{
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation',
            }}
          >
            <span aria-hidden="true" className="mr-2">
              ←
            </span>
            Back to Class
          </Link>
        </div>
      </div>
    </main>
  )
}
