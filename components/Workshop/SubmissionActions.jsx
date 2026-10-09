'use client'
import { useId } from 'react'
import { ClassIcon } from './ClassroomDecor'
import design from './ClassroomDesign.module.css'

export function keepFocusedWorkVisible(event) {
    const field = event.target, actions = event.currentTarget.querySelector('[data-submit-actions]')
    if (!actions || actions.contains(field) || getComputedStyle(actions).position !== 'sticky') return
    const box = field.getBoundingClientRect(), panel = actions.getBoundingClientRect()
    if (box.bottom > panel.top && box.top < panel.bottom) field.scrollIntoView({ block: 'center', behavior: 'instant' })
}

// Presentation only: the parent form keeps its existing explicit-submit handler.
export default function SubmissionActions({ busy, pending, submitted, disabled, label, confirmation, blockedReason }) {
    const statusId = useId(), helpId = useId()
    if (submitted) return <div role="status" data-submit-actions className={design.submissionActions + ' ' + design.receipt}>
        <ClassIcon kind="CHECK" /><div><strong>Submitted</strong><p className={design.submissionHelp}>{confirmation}</p></div>
    </div>
    const status = busy ? 'Submitting…' : pending ? 'Submission not confirmed yet' : 'Not submitted yet'
    const help = busy ? 'Wait for the Submitted confirmation. Your draft is kept.'
        : pending ? 'Your answers are kept. Try Submit again to confirm they arrived.'
            : blockedReason || 'Saving keeps a draft. Click Submit when your work is ready.'
    return <div data-submit-actions className={design.submissionActions}>
        <div role="status" aria-live="polite" aria-atomic="true">
            <strong id={statusId}>{status}</strong><p id={helpId} className={design.submissionHelp}>{help}</p>
        </div>
        <button type="submit" className={'formBlackButton ' + design.submitButton} disabled={disabled}
            aria-describedby={statusId + ' ' + helpId}>
            {busy ? 'Submitting…' : pending ? 'Try Submit again' : label}<ClassIcon kind="ARROW" />
        </button>
    </div>
}
