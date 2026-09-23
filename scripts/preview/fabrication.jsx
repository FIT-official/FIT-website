import React from 'react'
import { createRoot } from 'react-dom/client'
import FabricationRequestFlow from '@/components/Fabrication/FabricationRequestFlow'
import FabricationCatalogEditor from '@/components/Fabrication/FabricationCatalogEditor'
import FabricationJobs from '@/components/Fabrication/FabricationJobs'
import Creators from '@/app/creators/join/Creators'
import { PreviewProviders } from './flow-mocks'
import '@/app/globals.css'

const tab = new URLSearchParams(location.search).get('tab') || 'request'
createRoot(document.getElementById('root')).render(<PreviewProviders>
  <div style={{ background: '#fff7dc', color: '#713f12', textAlign: 'center', padding: 10, fontSize: 12 }}>Local preview · illustrative rates · accounts, storage and requests simulated · no production changes</div>
  <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 20, padding: 16, fontSize: 13 }}>{[['request','Customer request'],['catalog','Provider catalogue'],['provider','Provider jobs'],['customer','Customer jobs'],['plans','Creator plans']].map(([key,label]) => <a key={key} href={`/fabrication.html?creator=studio&offer=name-tag&tab=${key}`} style={{ textDecoration: 'underline' }}>{label}</a>)}</nav>
  {tab === 'plans' ? <Creators /> : tab === 'request' ? <FabricationRequestFlow /> : <div className="mx-auto max-w-5xl px-4 py-8">{tab === 'catalog' ? <FabricationCatalogEditor /> : <FabricationJobs role={tab === 'provider' ? 'provider' : 'customer'} />}</div>}
</PreviewProviders>)
