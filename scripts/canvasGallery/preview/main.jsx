import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import CanvasSubmissionGallery from '../../../components/Workshop/CanvasSubmissionGallery'
import '../../groupCanvas/preview/preview.css'
function App() { const [show, setShow] = useState(true); return <main><header className="fixture"><strong>SYNTHETIC LOCAL GALLERY · NO REAL STUDENT RECORDS</strong><button type="button" onClick={() => setShow(value => !value)}>{show ? 'Synthetic sign out' : 'Synthetic teacher sign in'}</button></header>{show ? <CanvasSubmissionGallery /> : <p>Signed out. Private gallery removed.</p>}</main> }
createRoot(document.getElementById('root')).render(<App />)
