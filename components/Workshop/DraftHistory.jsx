'use client'
import { useState } from 'react'
const labels = { whatWorks: 'What works well, and why?', question: 'What question would you ask the presenters?', improvement: 'What specific improvement do you suggest?', feedbackUsed: 'Earlier answer: Which feedback are you using?', change: 'What would you change to improve this idea?', reason: 'Why would this improve the idea?', test: 'How would you test this change?' }
export function draftStatus(status = '', conflict = false) {
    if (conflict) return 'A newer draft is available. Open Earlier drafts to compare.'
    if (/offline/i.test(status)) return 'Offline. Your answers are kept on this device.'
    if (/^Autosaved draft|^Recovered draft/.test(status)) return 'Saved'
    if (/^Autosaving|^Draft changes waiting/.test(status)) return 'Saving…'
    if (/^Restoring/.test(status)) return 'Opening your saved draft…'
    if (/^Draft kept on this browser/.test(status)) return 'Autosave is on'
    if (/^Draft restored/.test(status)) return 'Draft restored. Saving…'
    return status ? 'Couldn’t save. Try again. Keep this page open.' : ''
}
export function DraftPreview({ content }) {
    if (!content || typeof content !== 'object') return <p>No answers in this draft.</p>
    if (Array.isArray(content.ideas)) return content.ideas.map((idea, index) => <section key={index} className="mt-3"><h4 className="font-semibold">Idea {index + 1}</h4><DraftPreview content={idea} /></section>)
    const answers = Object.entries(labels).filter(([key]) => typeof content[key] === 'string' && content[key].trim())
    return answers.length ? <dl className="space-y-3 mt-3">{answers.map(([key, label]) => <div key={key}><dt className="font-semibold">{label}</dt><dd className="whitespace-pre-wrap break-words">{content[key]}</dd></div>)}</dl> : <p className="mt-3">No answers in this draft.</p>
}
export default function DraftHistory({ controls, disabled, status }) {
    const [selected, setSelected] = useState('')
    const rows = controls.remote?.snapshots || [], snapshot = rows.find(row => String(row.version) === selected)
    return <div className="ph-mask ph-no-capture border rounded-lg p-3 mt-4">
        <div className="flex flex-wrap items-center gap-3"><button type="button" className="formWhiteButton text-sm" disabled={disabled} onClick={controls.retry}>Save</button><span role="status" aria-live="polite" className="text-sm">{draftStatus(status, controls.conflict)}</span></div>
        <div className="flex flex-wrap gap-4 mt-3"><button type="button" className="underline text-sm" disabled={disabled || !controls.canUndo} onClick={controls.undo}>Undo</button><button type="button" className="underline text-sm" disabled={disabled || !controls.canRedo} onClick={controls.redo}>Redo</button></div>
        <details className="mt-3" onToggle={event => { if (event.currentTarget.open) controls.compare() }}><summary className="cursor-pointer text-sm">Earlier drafts</summary>
            {rows.length ? <><label className="block mt-3">Choose an earlier draft<select className="formInput block w-full" value={selected} onChange={event => setSelected(event.target.value)}><option value="">Choose a date</option>{rows.map((row, index) => <option key={row.version} value={row.version}>{new Date(row.savedAt).toLocaleString()} · Saved answer {index + 1}</option>)}</select></label>{snapshot && <><DraftPreview content={snapshot.content} /><button type="button" className="formWhiteButton mt-3" disabled={disabled} onClick={() => controls.rebase(snapshot.content)}>Restore draft</button></>}</> : <p className="mt-3">No earlier drafts yet.</p>}
            {controls.conflict && <><p className="mt-3">Compare the saved answers with your writing before choosing.</p><button type="button" className="formWhiteButton mt-3" disabled={disabled} onClick={() => controls.rebase()}>Keep my current answers</button></>}
        </details>
    </div>
}
