'use client'
import { useState } from 'react'
import WorkshopAudit from './WorkshopAudit'
import { groupName } from '@/lib/workshopTeacherView'

const feedbackLabels = { whatWorks: 'What works', question: 'Question', improvement: 'Improvement' }
const revisionLabels = { feedbackUsed: 'Feedback used', change: 'Proposed change', reason: 'Reason', test: 'Next test' }
const textStyle = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.6 }
const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: '16px' }

function Answers({ labels, answers }) {
    return <dl style={gridStyle}>{Object.entries(labels).map(([key, label]) => <div key={key}>
        <dt className="font-semibold text-sm">{label}</dt><dd className="mt-1" style={textStyle}>{answers[key] || 'No response'}</dd>
    </div>)}</dl>
}

export default function TeacherWorkCard({ row, audit = [], busy, onAction }) {
    const [edit, setEdit] = useState(null), [deleting, setDeleting] = useState(null)
    const refinement = row.kind === 'refinement'
    const currentRevisionLabels = row.promptVersion === 2 ? { change: 'What would you change to improve this idea?', reason: 'Why would this improve the idea?', test: 'How would you test this change?' } : revisionLabels
    const version = refinement ? row.entryVersion || 1 : row.version || 1
    const title = refinement ? `Revision ${row.authorVersion || row.version || 1}` : `Feedback for ${groupName(row.target)} · Idea ${row.idea}`
    function startEdit() {
        setEdit({ expectedEntryVersion: version, visibility: row.visibility,
            fields: refinement ? { ideas: row.ideas.map(idea => Object.fromEntries(Object.keys(currentRevisionLabels).map(key => [key, idea[key]]))) }
                : Object.fromEntries(Object.keys(feedbackLabels).map(key => [key, row[key]])) })
    }
    async function save(event) {
        event.preventDefault()
        const saved = await onAction({ action: row.kind, id: row.id, expectedEntryVersion: edit.expectedEntryVersion, visibility: edit.visibility, edit: edit.fields })
        if (saved) setEdit(null)
    }
    function field(key, label, value, index) {
        return <label className="block mt-3" key={key}>{label}<textarea required maxLength={600} className="formInput block w-full" value={value || ''}
            onChange={event => setEdit(current => ({ ...current, fields: refinement
                ? { ideas: current.fields.ideas.map((idea, i) => i === index ? { ...idea, [key]: event.target.value } : idea) }
                : { ...current.fields, [key]: event.target.value } }))} /></label>
    }
    return <article aria-label={`${row.nameLabel}: ${title}`} className="border rounded-xl p-4 mt-3" style={{ overflowWrap: 'anywhere', background: 'white' }}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h5 className="font-semibold">{row.nameLabel} · {groupName(row.source)} — {title}</h5>
            {row.visibility !== 'visible' && <span className="text-sm rounded-full border px-3 py-1">{row.visibility === 'deleted' ? 'In Trash' : row.visibility === 'hidden' ? 'Hidden from students' : 'Blocked from students'}</span>}
        </div>
        {refinement ? row.ideas.map(idea => <section key={idea.idea} className="mt-4"><h6 className="font-semibold mb-2">Idea {idea.idea}</h6><Answers labels={currentRevisionLabels} answers={idea} /></section>)
            : <Answers labels={feedbackLabels} answers={row} />}
        <details className="mt-4 text-sm"><summary className="cursor-pointer">Manage submission</summary>
            <div className="flex flex-wrap gap-3 mt-3">{(row.visibility === 'deleted' ? ['visible'] : ['hidden', 'blocked', 'visible']).map(visibility => <button type="button" className="formWhiteButton" key={visibility}
                disabled={busy || row.visibility === visibility} onClick={() => onAction({ action: row.kind, id: row.id, expectedEntryVersion: version, visibility })}>
                {visibility === 'visible' ? 'Restore to students' : visibility === 'hidden' ? 'Hide from students' : 'Block from students'}</button>)}
                <button type="button" className="formWhiteButton" disabled={busy || Boolean(edit)} onClick={startEdit}>Edit submission</button>{row.visibility !== 'deleted' && <button type="button" className="formWhiteButton" disabled={busy} onClick={() => setDeleting(version)}>Delete</button>}
            </div>
        </details>
        {deleting !== null && <div role="alertdialog" aria-label="Delete submission" className="border rounded p-4 mt-3"><p>Move this submission from {row.nameLabel}, {groupName(row.source)}, to Trash? You can restore it later.</p><button type="button" className="formBlackButton mt-3" disabled={busy} onClick={async () => { if (await onAction({ action: row.kind, id: row.id, expectedEntryVersion: deleting, visibility: 'deleted' })) setDeleting(null) }}>Move to Trash</button><button type="button" className="formWhiteButton ml-3" disabled={busy} onClick={() => setDeleting(null)}>Cancel</button></div>}
        {edit && <form className="border-t mt-4 pt-2" aria-label={`Edit ${row.nameLabel}'s submission`} onSubmit={save}>
            {refinement ? edit.fields.ideas.map((idea, index) => <fieldset key={index}><legend className="font-semibold mt-3">Idea {index + 1}</legend>
                {Object.entries(currentRevisionLabels).map(([key, label]) => field(key, label, idea[key], index))}</fieldset>)
                : Object.entries(feedbackLabels).map(([key, label]) => field(key, label, edit.fields[key]))}
            <div className="flex flex-wrap gap-3 mt-3"><button className="formBlackButton" disabled={busy}>Save changes</button>
                <button type="button" className="formWhiteButton" disabled={busy} onClick={() => setEdit(null)}>Cancel edit</button></div>
            {edit.expectedEntryVersion !== version && <div role="status" className="border rounded-lg p-4 mt-3"><p>This submission changed. Your edit is kept. Compare the current response above before saving.</p>
                <button type="button" className="formWhiteButton mt-3" disabled={busy} onClick={() => setEdit(current => ({ ...current, expectedEntryVersion: version, visibility: row.visibility }))}>Keep my edit and use latest version</button></div>}
        </form>}
        <details className="mt-3 text-sm"><summary className="cursor-pointer">Record details</summary>
            <p className="mt-2">Submitted: {new Date(row.recordedAt).toLocaleString()}</p><p>Student record: {row.seat || 'Unavailable'}</p>
            <p>Receipt: {row.id} · Entry version: {version}</p>
            <WorkshopAudit events={audit} />
        </details>
    </article>
}
