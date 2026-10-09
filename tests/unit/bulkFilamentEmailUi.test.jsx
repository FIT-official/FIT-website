import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import BulkFilamentRequests from '@/components/Admin/BulkFilamentRequests'
import BulkFilamentForm from '@/components/Shop/BulkFilamentForm'
import { bulkEmailCopy } from '@/lib/bulkEmailCopy'
vi.mock('next/link',()=>({default:({children,...props})=><a {...props}>{children}</a>}))
const response=body=>({ok:true,json:async()=>body})
beforeEach(()=>{sessionStorage.clear();vi.stubGlobal('fetch',vi.fn())})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
const row=status=>({_id:'12345678-1234-4234-8234-123456789abc',status:'new',revision:0,createdAt:'2026-10-09',customer:{name:'Synthetic QA',phone:'+65 8000 0000',email:'qa@example.invalid'},fulfilment:'collection',lines:[],ownerEmailStatus:status,notifications:{email:{status,attempts:1,recipient:'fixittoday.contact@gmail.com'}}})
it.each(['accepted','failed','uncertain','sending','not_configured'])('shows saved public receipt with accurate email outcome %s',async status=>{
  sessionStorage.setItem('fit-bulk-filament-pending-v1',JSON.stringify({receipt:{requestId:'test-receipt',totalRolls:10,ownerEmailStatus:status}}))
  fetch.mockResolvedValue(response({products:[]})); render(<BulkFilamentForm/>);
  expect(await screen.findByText('test-receipt')).toBeInTheDocument()
  expect(screen.getByText(text=>text.includes(bulkEmailCopy(status)))).toBeInTheDocument()
  expect(screen.getByText(/No stock has been reserved and no payment has been taken/)).toBeInTheDocument()
})
it('lets the owner retry a definite failed alert and renders the returned provider status',async()=>{
  fetch.mockResolvedValueOnce(response({requests:[row('failed')],next:null})).mockResolvedValueOnce(response({request:row('accepted')}))
  render(<BulkFilamentRequests/>);fireEvent.click(await screen.findByRole('button',{name:'Retry owner email'}))
  expect(await screen.findByText(bulkEmailCopy('accepted'))).toBeInTheDocument();expect(screen.queryByText(/Email and Telegram alerts are not configured/)).not.toBeInTheDocument()
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({requestId:row('failed')._id,action:'retry_owner_email'})
  expect(screen.queryByRole('button',{name:'Retry owner email'})).not.toBeInTheDocument()
})
it.each(['accepted','sending','uncertain'])('does not expose a resend button for %s',async status=>{
  fetch.mockResolvedValue(response({requests:[row(status)],next:null}));render(<BulkFilamentRequests/>);
  expect(await screen.findByText(bulkEmailCopy(status))).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Retry owner email'})).not.toBeInTheDocument()
})
it('preserves legacy records without offering bulk backfill',async()=>{
  const old=row('not_configured');old.notifications.email='not_configured';fetch.mockResolvedValue(response({requests:[old],next:null}));render(<BulkFilamentRequests/>);
  await screen.findByText('Synthetic QA');expect(screen.queryByRole('button',{name:'Retry owner email'})).not.toBeInTheDocument()
})
