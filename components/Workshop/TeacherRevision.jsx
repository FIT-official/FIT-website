'use client'
import { useState } from 'react'
const labels = { feedbackUsed: 'Feedback used', change: 'Change', reason: 'Reason', test: 'Next test' }
export default function TeacherRevision({ row, busy, onAction }) {
    const [edit, setEdit] = useState(null)
    const version = row.entryVersion || 1
    async function save(event) {
        event.preventDefault()
        if (await onAction({ action: 'refinement', id: row.id, expectedEntryVersion: edit.expectedEntryVersion, visibility: edit.visibility, edit: { ideas: edit.ideas } })) setEdit(null)
    }
    return <article className="border rounded-xl p-5 mt-4" aria-label={'Refinement ' + row.id}>
        <h3>Group {row.group.slice(1)} · Revision {row.version} · {row.seat}</h3>
        <p>Visibility: {row.visibility || 'visible'} · Entry version {version}</p>
        {row.ideas.map(idea => <div key={idea.idea} className="mt-3"><h4>Idea {idea.idea}</h4>{Object.entries(labels).map(([key, label]) => <p key={key} className="whitespace-pre-wrap"><strong>{label}:</strong> {idea[key]}</p>)}</div>)}
        <div className="flex flex-wrap gap-3 mt-4">{['hidden', 'blocked', 'visible'].map(visibility => <button type="button" className="formWhiteButton" key={visibility} disabled={busy || (row.visibility || 'visible') === visibility} onClick={() => onAction({ action: 'refinement', id: row.id, expectedEntryVersion: version, visibility })}>{visibility === 'visible' ? 'Restore revision to group' : visibility === 'hidden' ? 'Hide revision' : 'Block revision'}</button>)}<button type="button" className="formWhiteButton" disabled={busy} onClick={() => setEdit({ expectedEntryVersion: version, visibility: row.visibility || 'visible', ideas: row.ideas.map(idea => Object.fromEntries(Object.keys(labels).map(key => [key, idea[key]]))) })}>Edit revision</button></div>
        {edit && <form onSubmit={save} className="mt-4" aria-label={'Edit refinement ' + row.id}>{edit.ideas.map((idea, index) => <fieldset key={index}><legend>Idea {index + 1}</legend>{Object.entries(labels).map(([key, label]) => <label key={key} className="block mt-3">{label}<textarea aria-label={'Idea ' + (index + 1) + ' ' + label} required maxLength={600} value={idea[key]} className="formInput block w-full" onChange={event => setEdit({ ...edit, ideas: edit.ideas.map((value, i) => i === index ? { ...value, [key]: event.target.value } : value) })} /></label>)}</fieldset>)}<button className="formBlackButton mt-3" disabled={busy}>Save revision edit</button><button type="button" className="formWhiteButton ml-3" onClick={() => setEdit(null)}>Cancel revision edit</button>{edit.expectedEntryVersion !== version && <div className="border p-4 mt-3"><p>This revision changed. Your typed edit is kept. Compare the latest revision above before continuing.</p><button type="button" className="formWhiteButton mt-3" onClick={() => setEdit({ ...edit, expectedEntryVersion: version, visibility: row.visibility || 'visible' })}>Keep my revision edit and use latest entry version</button></div>}</form>}
    </article>
}
