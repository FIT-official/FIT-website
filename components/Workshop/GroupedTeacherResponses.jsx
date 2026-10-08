'use client'
import { useMemo, useState } from 'react'
import { groupName, groupTeacherWork, teacherWork } from '@/lib/workshopTeacherView'
import TeacherWorkCard from './TeacherWorkCard'

export default function GroupedTeacherResponses({ lesson, busy, onAction }) {
    const [groupBy, setGroupBy] = useState('source')
    const [group, setGroup] = useState('all')
    const [search, setSearch] = useState('')
    const [status, setStatus] = useState('all')
    const [type, setType] = useState('all')
    const [closed, setClosed] = useState({})
    const all = useMemo(() => teacherWork(lesson), [lesson])
    const sections = useMemo(() => groupTeacherWork(all, { groupBy, group, search, status, type }), [all, groupBy, group, search, status, type])
    const groups = [...new Set([...(lesson.progress || []).map(row => row.group), ...all.flatMap(row => [row.source, row.target])])].filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    const count = sections.reduce((sum, section) => sum + section.count, 0)
    const students = new Set(sections.flatMap(section => section.students.map(student => student.key))).size
    const auditById = useMemo(() => {
        const result = new Map()
        for (const event of lesson.audit || []) {
            if (!result.has(event.id)) result.set(event.id, [])
            result.get(event.id).push(event)
        }
        return result
    }, [lesson.audit])
    function reset() { setGroup('all'); setSearch(''); setStatus('all'); setType('all'); setClosed({}) }
    return <section aria-labelledby="responses-title" className="mt-8">
        <h2 id="responses-title" className="text-2xl">Student work</h2>
        <p className="mt-2 text-sm">Browse each student’s comments and revisions together. New submissions appear automatically.</p>
        <div className="border rounded-xl p-4 mt-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: '16px' }}>
            <label>Find a student or comment<input type="search" className="formInput block w-full" placeholder="Search names or responses" value={search} onChange={event => { setSearch(event.target.value); setClosed({}) }} /></label>
            <label>Group<select className="formInput block w-full" value={group} onChange={event => { setGroup(event.target.value); setClosed({}) }}><option value="all">All groups</option>{groups.map(id => <option key={id} value={id}>{groupName(id)}</option>)}</select></label>
            <label>Organise by<select className="formInput block w-full" value={groupBy} onChange={event => { setGroupBy(event.target.value); setGroup('all'); setClosed({}) }}><option value="source">Student’s group</option><option value="target">Group receiving feedback</option></select></label>
        </div>
        <details className="mt-3"><summary className="cursor-pointer text-sm">More filters{status !== 'all' || type !== 'all' ? ' · filters active' : ''}</summary>
            <div className="flex flex-wrap gap-4 mt-3"><label>Visibility<select className="formInput block" value={status} onChange={event => { setStatus(event.target.value); setClosed({}) }}>
                <option value="all">All submissions</option><option value="visible">Visible to students</option><option value="hidden">Hidden from students</option><option value="blocked">Blocked from students</option></select></label>
                <label>Submission type<select className="formInput block" value={type} onChange={event => { setType(event.target.value); setClosed({}) }}><option value="all">Comments and revisions</option><option value="feedback">Comments</option><option value="refinement">Revisions</option></select></label>
            </div>
        </details>
        <div className="flex flex-wrap justify-between items-center gap-3 mt-5">
            <p role="status" className="text-sm">{count} {count === 1 ? 'submission' : 'submissions'} · {students} {students === 1 ? 'student' : 'students'} with work · {sections.length} {sections.length === 1 ? 'group' : 'groups'}</p>
            <div className="flex flex-wrap gap-3">{(search || group !== 'all' || status !== 'all' || type !== 'all') && <button type="button" className="underline text-sm" onClick={reset}>Clear filters</button>}
                {sections.length > 0 && <><button type="button" className="underline text-sm" onClick={() => setClosed({})}>Expand all</button><button type="button" className="underline text-sm" onClick={() => setClosed(Object.fromEntries(sections.map(section => [section.id, true])))}>Collapse all</button></>}
            </div>
        </div>
        {!count && <p className="border rounded-xl p-5 mt-4">{all.length ? 'No work matches these filters. Try another name or group, or clear the filters.' : 'No submissions yet. Students’ comments and revisions will appear here.'}</p>}
        {sections.map(section => <section className="border rounded-xl mt-5 overflow-hidden" key={section.id} aria-label={`${groupName(section.id)} work`}>
            <h3><button type="button" className="w-full p-4 text-left flex flex-wrap justify-between items-center gap-3" style={{ background: '#f3f5f7' }} aria-expanded={!closed[section.id]}
                aria-controls={`work-${groupBy}-${section.id}`} onClick={() => setClosed(current => ({ ...current, [section.id]: !current[section.id] }))}>
                <span className="text-xl font-semibold">{groupName(section.id)}{groupBy === 'target' ? ' · received feedback and revisions' : ''}</span>
                <span className="text-sm">{section.count} {section.count === 1 ? 'submission' : 'submissions'} · {closed[section.id] ? 'Expand' : 'Collapse'}</span>
            </button></h3>
            <div id={`work-${groupBy}-${section.id}`} hidden={Boolean(closed[section.id])} className="p-4">
                {section.students.map(student => <section className="mb-6 last:mb-0" key={student.key} aria-label={`${student.name} · ${groupName(student.group)}`}>
                    <h4 className="text-lg font-semibold">{student.name} <span className="font-normal text-sm">· {groupName(student.group)}</span></h4>
                    {student.rows.map(row => <TeacherWorkCard key={`${row.kind}:${row.id}`} row={row} audit={auditById.get(row.id)} busy={busy} onAction={onAction} />)}
                </section>)}
            </div>
        </section>)}
    </section>
}
