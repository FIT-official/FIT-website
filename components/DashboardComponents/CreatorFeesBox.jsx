
'use client'

import Link from 'next/link'
import { DashCard } from '@/components/dashboard-ui'
import {
  CREATOR_FEES_COPY,
  CREATOR_FEE_POINTS,
} from '@/content/creator/fees'

export default function CreatorFeesBox() {
  return (
    <DashCard
      title={CREATOR_FEES_COPY.title}
      className="min-w-0"
    >
      <div className="min-w-0 space-y-4 break-words text-sm leading-relaxed">
        <p>{CREATOR_FEES_COPY.intro}</p>

        <p className="min-w-0 break-words">
          Questions:{' '}
          <a
            href={`mailto:${CREATOR_FEES_COPY.contactEmail}`}
            className="inline-flex min-h-11 min-w-0 items-center break-all underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dash-ink)]"
          >
            {CREATOR_FEES_COPY.contactEmail}
          </a>
        </p>

        <ul
          aria-label="Creator fees"
          className="min-w-0 list-disc space-y-3 pl-5"
        >
          {CREATOR_FEE_POINTS.map(point => (
            <li
              key={point.id}
              className="min-w-0 break-words pl-1"
            >
              {point.text && (
                <span>{point.text}</span>
              )}

              {point.items && (
                <ul className="list-disc space-y-2 pl-5">
                  {point.items.map(item => (
                    <li
                      key={item.label}
                      className="min-w-0 break-words"
                    >
                      <strong>{item.label}:</strong>{' '}
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ul>
              )}

              <small className="ml-1 text-xs text-[var(--dash-muted,var(--dash-ink))]">
                (clause {point.clause})
              </small>
            </li>
          ))}
        </ul>

        <div className="flex min-w-0 flex-wrap">
          <Link
            href={CREATOR_FEES_COPY.link.href}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-[var(--dash-line)] px-4 py-2 font-medium underline underline-offset-2 hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dash-ink)]"
          >
            {CREATOR_FEES_COPY.link.label}
          </Link>
        </div>
      </div>
    </DashCard>
  )
}

