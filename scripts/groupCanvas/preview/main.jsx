import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import GroupCanvas from '../../../components/Workshop/GroupCanvas'
import TeacherCanvasPanel from '../../../components/Workshop/TeacherCanvasPanel'
import './preview.css'
const nativeFetch = window.fetch.bind(window)
window.fixtureActor = sessionStorage.getItem('canvas-actor') || 'alpha'
window.fetch = (url, options = {}) => nativeFetch(url, { ...options, headers: { ...options.headers, 'x-fixture-actor': window.fixtureActor } })
function App() { const [actor, setActor] = useState(window.fixtureActor), [lesson, setLesson] = useState(null), [idea, setIdea] = useState(sessionStorage.getItem('canvas-idea') || '1'); useEffect(() => { let alive = true; fetch('/__fixture/actor').then(r => r.json()).then(value => { if (alive) setLesson(value) }); return () => { alive = false } }, [actor]); return <main><header className="fixture"><strong>SYNTHETIC LOCAL PREVIEW · no student records</strong><label>Test account<select value={actor} onChange={e => { window.fixtureActor = e.target.value; sessionStorage.setItem('canvas-actor', e.target.value); setLesson(null); setActor(e.target.value) }}><option value="alpha">Group 1 · synthetic A</option><option value="partner">Group 1 · synthetic B</option><option value="beta">Group 2 · synthetic C</option><option value="teacher">Synthetic teacher</option><option value="signed-out">Signed out</option></select></label><label>Test idea<select value={idea} onChange={e => { sessionStorage.setItem('canvas-idea', e.target.value); setIdea(e.target.value) }}><option>1</option><option>2</option></select></label></header>{actor === 'teacher' ? <TeacherCanvasPanel /> : actor === 'signed-out' ? <p>Signed out. No private drawing is shown.</p> : lesson?.seat ? <GroupCanvas key={lesson.seat + ':' + idea} lesson={lesson} idea={idea} /> : <p>Loading synthetic actor…</p>}</main> }
createRoot(document.getElementById('root')).render(<App />)
