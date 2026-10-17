
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashCard } from '@/components/dashboard-ui'
import { WALKTHROUGH_STEPS } from '@/content/creator/walkthrough'

const STORAGE_KEY = 'fit.creatorWalkthrough.v1'
const STEP_COUNT = WALKTHROUGH_STEPS.length

const INITIAL_STATE = {
  dismissed: false,
  step: 1,
}

const CONTROL_CLASS =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dash-ink)]'

const SECONDARY_CLASS =
  `${CONTROL_CLASS} border border-[var(--dash-line)] ` +
  'text-[var(--dash-ink)] hover:bg-black/5'

const PRIMARY_CLASS =
  `${CONTROL_CLASS} bg-[var(--dash-ink)] text-white ` +
  'hover:opacity-90'

function readStoredState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)

    if (raw === null) return null

    const value = JSON.parse(raw)

    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      typeof value.dismissed !== 'boolean' ||
      !Number.isInteger(value.step) ||
      value.step < 1 ||
      value.step > STEP_COUNT
    ) {
      return null
    }

    return {
      dismissed: value.dismissed,
      step: value.step,
    }
  } catch {
    return null
  }
}

function writeStoredState(value) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        dismissed: value.dismissed,
        step: value.step,
      })
    )
  } catch {
    // The guide remains usable when browser storage is unavailable.
  }
}

export default function CreatorWalkthrough() {
  const [guide, setGuide] = useState(INITIAL_STATE)

  // Restore browser state only after mounting.
  useEffect(() => {
    const stored = readStoredState()

    if (stored) {
      setGuide(stored)
    }
  }, [])

  function updateGuide(nextState) {
    setGuide(nextState)
    writeStoredState(nextState)
  }

  function goToStep(step) {
    if (
      !Number.isInteger(step) ||
      step < 1 ||
      step > STEP_COUNT
    ) {
      return
    }

    updateGuide({
      ...guide,
      step,
    })
  }

  function setDismissed(dismissed) {
    updateGuide({
      ...guide,
      dismissed,
    })
  }

  const currentStep = WALKTHROUGH_STEPS[guide.step - 1]

  return (
    <DashCard
      title="Creator walkthrough"
      className={
        guide.dismissed
          ? 'min-w-0 [&>header]:pb-4 [&>div]:hidden'
          : 'min-w-0'
      }
      action={
        <button
          type="button"
          onClick={() => setDismissed(!guide.dismissed)}
          aria-expanded={!guide.dismissed}
          className={SECONDARY_CLASS}
        >
          {guide.dismissed ? 'Show guide' : 'Hide guide'}
        </button>
      }
    >
      {!guide.dismissed && (
        <div className="min-w-0 space-y-4">
          <p className="text-sm font-medium text-[var(--dash-ink)]">
            Step {guide.step} of {STEP_COUNT}
          </p>

          <nav
            aria-label="Walkthrough steps"
            className="flex min-w-0 flex-wrap gap-2"
          >
            {WALKTHROUGH_STEPS.map((step, index) => {
              const number = index + 1
              const active = number === guide.step

              return (
                <button
                  key={step.id}
                  type="button"
                  aria-label={`Step ${number}: ${step.title}`}
                  aria-current={active ? 'step' : undefined}
                  onClick={() => goToStep(number)}
                  className={
                    'flex h-11 w-11 min-h-11 min-w-11 ' +
                    'shrink-0 items-center justify-center ' +
                    'rounded-full border text-sm font-semibold ' +
                    'focus-visible:outline focus-visible:outline-2 ' +
                    'focus-visible:outline-offset-2 ' +
                    'focus-visible:outline-[var(--dash-ink)] ' +
                    (
                      active
                        ? 'border-[var(--dash-ink)] bg-[var(--dash-ink)] text-white'
                        : 'border-[var(--dash-line)] text-[var(--dash-ink)] hover:bg-black/5'
                    )
                  }
                >
                  {number}
                </button>
              )
            })}
          </nav>

          <div
            aria-live="polite"
            aria-atomic="true"
            className="min-w-0 space-y-3 break-words"
          >
            <h4 className="text-lg font-semibold text-[var(--dash-ink)]">
              {currentStep.title}
            </h4>

            <p className="text-sm leading-relaxed">
              {currentStep.body}
            </p>

            {currentStep.options && (
              <ul className="space-y-3">
                {currentStep.options.map(option => (
                  <li
                    key={option.id}
                    className="min-w-0 break-words"
                  >
                    <h5 className="text-sm font-semibold">
                      {option.title}
                    </h5>

                    <p className="mt-1 text-sm leading-relaxed">
                      {option.body}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {currentStep.action?.type === 'next' && (
              <div className="flex flex-wrap">
                <button
                  type="button"
                  onClick={() => goToStep(guide.step + 1)}
                  className={PRIMARY_CLASS}
                >
                  {currentStep.action.label}
                </button>
              </div>
            )}

            {currentStep.action?.type === 'link' && (
              <div className="flex flex-wrap">
                <Link
                  href={currentStep.action.href}
                  className={PRIMARY_CLASS}
                >
                  {currentStep.action.label}
                </Link>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--dash-line)] pt-3">
            <button
              type="button"
              disabled={guide.step === 1}
              onClick={() => goToStep(guide.step - 1)}
              className={
                `${SECONDARY_CLASS} ` +
                'disabled:cursor-not-allowed disabled:opacity-50'
              }
            >
              Back
            </button>

            <button
              type="button"
              disabled={guide.step === STEP_COUNT}
              onClick={() => goToStep(guide.step + 1)}
              className={
                `${SECONDARY_CLASS} ` +
                'disabled:cursor-not-allowed disabled:opacity-50'
              }
            >
              Next
            </button>
          </div>
        </div>
      )}
    </DashCard>
  )
}

