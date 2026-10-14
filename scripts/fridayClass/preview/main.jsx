import React, { useEffect, useState } from 'react'
/* eslint-disable @next/next/no-img-element -- synthetic Vite fixture; production uses Next Image */
import { createRoot } from 'react-dom/client'
import GuestRefinementForm from '../../../components/Workshop/GuestRefinementForm'
import PupilIdeaCopy from '../../../components/Workshop/PupilIdeaCopy'
import GuestBalancedFeedback from '../../../components/Workshop/GuestBalancedFeedback'
import { workshopGroupPage, workshopClassroomGroupPage } from '../../../lib/workshopPages'
import '../../groupCanvas/preview/preview.css'
const nativeFetch = window.fetch.bind(window)
window.fixtureActor = sessionStorage.getItem('friday-actor') || 'alpha'
window.fetch = (url, options = {}) => nativeFetch(url, { ...options, headers: { ...options.headers, 'x-fixture-actor': window.fixtureActor } })
function App() {
    const [lesson, setLesson] = useState(null), [actor, setActor] = useState(window.fixtureActor), refresh = () => fetch('/api/workshop/guest/classroom').then(r => r.json()).then(setLesson), group = workshopGroupPage('g10')
    useEffect(() => { refresh() }, [actor])
    return <main><header className="fixture"><strong>SYNTHETIC LOCAL EDIT PREVIEW — no student records</strong><label>Test reviewer<select value={actor} onChange={event => { window.fixtureActor = event.target.value; sessionStorage.setItem('friday-actor', event.target.value); setLesson(null); setActor(event.target.value) }}><option value="alpha">Synthetic A</option><option value="beta">Synthetic B</option></select></label></header><section><h1>Our design revision</h1><img src={group.models[0].src} alt={group.models[0].alt} style={{ width: '100%', maxWidth: 760 }} /><PupilIdeaCopy copy={group.ideas[0].pupilCopy} /></section>{lesson?.seat ? <><GuestRefinementForm key={'refinement:' + lesson.seat} lesson={lesson} onRefresh={refresh} /><GuestBalancedFeedback key={'feedback:' + lesson.seat} group={workshopClassroomGroupPage('g1')} lesson={lesson} onRefresh={refresh} /></> : <p>Loading synthetic lesson</p>}</main>
}
createRoot(document.getElementById('root')).render(<App />)
