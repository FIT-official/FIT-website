import React from 'react'
import { createRoot } from 'react-dom/client'
import GuestClassroom from '../../../components/Workshop/GuestClassroom'
import GuestTeacherClassroom from '../../../components/Workshop/GuestTeacherClassroom'
import TeacherJoinRequests from '../../../components/Workshop/TeacherJoinRequests'
import '../../groupCanvas/preview/preview.css'
import '../../../app/globals.css'
import './preview.css'
const teacher = location.pathname.startsWith('/teacher'), nativeFetch = window.fetch.bind(window)
window.fetch = (url, options = {}) => nativeFetch(url, { ...options, headers: { ...options.headers, ...(teacher ? { 'x-fixture-teacher': 'verified' } : {}) } })
createRoot(document.getElementById('root')).render(<><header className="fixture"><strong>SYNTHETIC LOCAL CLASS — NO REAL STUDENT DATA</strong></header>{location.pathname === '/teacher-full' ? <GuestTeacherClassroom /> : teacher ? <main><h1>Synthetic teacher return check</h1><TeacherJoinRequests /></main> : <GuestClassroom />}</>)
