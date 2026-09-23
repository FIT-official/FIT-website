import React from 'react'
import { createRoot } from 'react-dom/client'
import PrintRequestFlow from '@/components/PrintRequestFlow'
import Editor from '@/app/editor/page'
import { PreviewProviders } from './flow-mocks'
import '@/app/globals.css'

const params = new URLSearchParams(location.search)
createRoot(document.getElementById('root')).render(<PreviewProviders>
  <div style={{ background: '#dbeafe', color: '#1e3a8a', textAlign: 'center', padding: 12, fontSize: 12 }}>Local preview · sample pricing · sign-in and storage connections are simulated · no orders or payments</div>
  <p id="preview-status" aria-live="polite" />
  {params.get('view') === 'editor' ? <Editor /> : <PrintRequestFlow />}
</PreviewProviders>)
