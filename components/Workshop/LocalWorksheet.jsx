'use client'
import { useEffect, useRef, useState } from 'react'
import { emptyWorkshopDraft, validateWorkshopDraft, missingWorkshopAnswers, workshopAnswerExport, workshopDraftKey, MAX_ANSWER_LENGTH } from '@/lib/workshopDraft'
export default function LocalWorksheet({ group, fields, ideas }) {
    const [draft, setDraft] = useState(() => emptyWorkshopDraft(group, fields))
    const [ready, setReady] = useState(false), [status, setStatus] = useState('Loading your saved answers.')
    const [missing, setMissing] = useState([]), [conflict, setConflict] = useState(false)
    const form = useRef(null), writable = useRef(true)
    const key = workshopDraftKey(group)
    useEffect(() => {
        function load() {
            try {
                const stored = localStorage.getItem(key)
                setDraft(stored ? validateWorkshopDraft(JSON.parse(stored), group, fields) : emptyWorkshopDraft(group, fields))
                writable.current = true; setStatus(stored ? 'Your saved answers are ready.' : 'Answers save on this browser as you type.')
            } catch { writable.current = false; setStatus('Saved answers could not be loaded. You can keep working and download your answers. Clear this group to start saving again.') }
            setReady(true)
        }
        load()
        const changedElsewhere = event => {
            if (event.storageArea === localStorage && event.key === key) { setConflict(true); writable.current = false; setStatus('This group changed in another tab. Your work is still here. Download it before loading the latest saved version.') }
        }
        window.addEventListener('storage', changedElsewhere)
        return () => window.removeEventListener('storage', changedElsewhere)
    }, [key, group, fields])
    function update(next) {
        setDraft(next); setMissing([])
        if (!writable.current) { setStatus('Your changes are here but are not saved. Download your answers.'); return }
        try { localStorage.setItem(key, JSON.stringify(next)); setStatus('Saved on this browser.') }
        catch { setStatus('This browser could not save your answers. Download them before leaving this page.') }
    }
    function download() {
        const text = JSON.stringify(workshopAnswerExport(draft, fields), null, 2), url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
        const link = document.createElement('a'); link.href = url; link.download = 'FIT-workshop-' + group + '-answers.json'; link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    function check(event) {
        event.preventDefault()
        const absent = missingWorkshopAnswers(draft, fields); setMissing(absent)
        if (absent.length) {
            setStatus('Choose an idea and write a short answer in each highlighted field.')
            const selector = absent[0] === 'idea' ? 'input[type="radio"]' : 'textarea[id="' + absent[0] + '"]'
            form.current?.querySelector(selector)?.focus()
        }
        else setStatus('All answer fields are complete. Download or print your answers to show your teacher. Nothing has been sent.')
    }
    async function restore(event) {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
        try {
            if (file.size > 30000) throw new Error('File is too large.')
            const next = validateWorkshopDraft(JSON.parse(await file.text()), group, fields)
            if (!window.confirm('Replace only this group’s current answers with this file?')) return
            update(next)
        } catch { setStatus('Use a valid FIT answer JSON file for ' + group + '. No answers were changed.') }
    }
    function loadLatest() {
        try {
            const stored = localStorage.getItem(key), next = stored ? validateWorkshopDraft(JSON.parse(stored), group, fields) : emptyWorkshopDraft(group, fields)
            if (!window.confirm('Load the latest saved answers for this group? Download your current work first if you need to keep it.')) return
            setDraft(next); setConflict(false); writable.current = true; setMissing([]); setStatus('Loaded the latest saved answers.')
        } catch { setStatus('The latest answers could not be loaded. Download your current work.') }
    }
    function clear() {
        if (!window.confirm('Clear only Group ' + group.slice(1) + ' answers on this browser? Other groups will stay saved.')) return
        try { localStorage.removeItem(key); writable.current = true; setConflict(false); setDraft(emptyWorkshopDraft(group, fields)); setMissing([]); setStatus('This group is clear. Answers will save as you type.') }
        catch { setStatus('This browser could not clear the saved answers. No work was changed.') }
    }
    return <section className="ph-no-capture ph-mask mt-12 border border-borderColor rounded-xl p-5 md:p-8" aria-labelledby="answers-heading">
        <h2 id="answers-heading" className="text-2xl">Your group’s answers</h2>
        <p className="mt-3 text-sm">Use group numbers only. Do not enter names, emails, logins or private class links. Answers stay in this browser, on this device. They are not sent to FIT or a teacher. Download or print a copy to share with your teacher. On a shared device, clear this group after keeping your copy.</p>
        <form ref={form} onSubmit={check} noValidate className="mt-6 print:hidden">
            <fieldset disabled={!ready}>
                <legend className="font-semibold">Which idea will you develop?</legend>
                <p id="idea-help" className="text-sm mt-2">{missing.includes('idea') ? 'Choose one idea before checking your answers.' : 'Compare both ideas, then choose one to develop.'}</p>
                {ideas.map((idea, index) => <label key={idea.title} className="flex gap-3 items-start mt-3"><input className="mt-1" type="radio" name={'idea-' + group} value={String(index + 1)} checked={draft.idea === String(index + 1)} aria-describedby="idea-help" data-missing={missing.includes('idea')} onChange={event => update({ ...draft, idea: event.target.value })} /><span>Idea {index + 1}: {idea.title}</span></label>)}
                {fields.map(field => <label key={field.id} className="block mt-6" htmlFor={field.id}>
                    <span className="text-xs text-lightColor">{field.activity}</span><span className="block font-semibold mt-1">{field.label}</span>
                    <textarea id={field.id} rows={3} maxLength={MAX_ANSWER_LENGTH} value={draft.answers[field.id]} aria-invalid={missing.includes(field.id)} data-missing={missing.includes(field.id)} aria-describedby={field.id + '-limit'} onChange={event => update({ ...draft, answers: { ...draft.answers, [field.id]: event.target.value } })} className={'formInput w-full mt-2 ' + (missing.includes(field.id) ? 'border-red-500' : '')} />
                    <span id={field.id + '-limit'} className="block text-xs mt-1">{draft.answers[field.id].length}/{MAX_ANSWER_LENGTH} characters</span>
                </label>)}
            </fieldset>
            <div className="flex flex-wrap gap-3 mt-6 print:hidden">
                <button type="submit" className="formBlackButton" disabled={!ready}>Check answers</button>
                <button type="button" className="formWhiteButton" onClick={download} disabled={!ready}>Download answers</button>
                <button type="button" className="formWhiteButton" onClick={() => window.print()} disabled={!ready}>Print answers</button>
                <button type="button" className="formWhiteButton" onClick={clear} disabled={!ready}>Clear this group</button>
            </div>
        </form>
        <label className="block text-sm mt-5 print:hidden">Restore this group’s downloaded answers<input type="file" accept=".json,application/json" onChange={restore} disabled={!ready} className="block mt-2 max-w-full" /></label>
        <div className="hidden print:block" aria-label="Printable group answers">
            <h3>Group {group.slice(1)} answers</h3><p>Chosen idea: {draft.idea ? ideas[Number(draft.idea) - 1].title : 'Not chosen'}</p>
            <dl>{fields.map(field => <div key={field.id} className="mt-4"><dt className="font-semibold">{field.label}</dt><dd className="whitespace-pre-wrap mt-2">{draft.answers[field.id] || 'Not answered'}</dd></div>)}</dl>
        </div>
        {conflict && <button className="formWhiteButton mt-4 print:hidden" onClick={loadLatest}>Load latest saved answers</button>}
        <p role="status" aria-live="polite" className="mt-4 text-sm">{status}</p>
    </section>
}
