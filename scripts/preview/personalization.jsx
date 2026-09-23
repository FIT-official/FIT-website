import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import PersonalizationEditor from '@/components/Fabrication/PersonalizationEditor'
import '@/app/globals.css'

// Synthetic geometry fixture for checking placement; this is not a customer upload.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="650" viewBox="0 0 1000 650">
<defs><linearGradient id="wood" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ead1ab"/><stop offset="1" stop-color="#d9b88a"/></linearGradient></defs>
<path d="M150 155H805Q855 155 855 205V445Q855 495 805 495H150Q110 495 110 455V195Q110 155 150 155Z M177 289a36 36 0 1 0 0 72a36 36 0 1 0 0-72Z" fill="url(#wood)" fill-rule="evenodd" stroke="#b9925e" stroke-width="4"/>
</svg>`

function Preview() {
  const [imageUrl, setImageUrl] = useState('')
  const [value, setValue] = useState({ text: 'Avery', region: null, fontFamily: 'serif', textColor: '#513c28' })
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [])
  return <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px', background: '#fff', minHeight: '100vh' }}>
    <h1 style={{ fontSize: 28, marginBottom: 8 }}>Make it personal</h1>
    <p style={{ color: '#687078', marginBottom: 24 }}>Preview your message on a sample wooden tag.</p>
    <PersonalizationEditor imageUrl={imageUrl} value={value} onChange={setValue} />
  </main>
}
createRoot(document.getElementById('root')).render(<Preview />)
