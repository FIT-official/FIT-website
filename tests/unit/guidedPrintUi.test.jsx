import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
const state=vi.hoisted(()=>({user:{id:'buyer'},store:{},params:{}}))
vi.mock('@clerk/nextjs',()=>({useUser:()=>({user:state.user,isLoaded:true}),SignInButton:({children})=><span>{children}</span>}))
vi.mock('next/link',()=>({default:({children,...props})=><a {...props}>{children}</a>}))
vi.mock('next/dynamic',()=>({default:()=>()=><div>Preview fixture</div>}))
vi.mock('@/utils/store',()=>({default:{getState:()=>state.store}}))
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams(state.params)}))
vi.mock('@/components/PrintRequestFlow',()=>({default:()=> <p>Existing expert flow</p>}))
import GuidedPrintRequest from '@/components/PrintRequest/GuidedPrintRequest'
import Page from '@/app/prints/request/page'
const ok=body=>({ok:true,json:async()=>body})
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();state.user={id:'buyer'};state.params={};global.fetch=vi.fn(async url=>url==='/api/custom-print/guided'?ok({uploadsAvailable:false}):ok({colours:[]}))})
afterEach(cleanup)
const fill=()=>fireEvent.change(screen.getByLabelText('Describe what you need'),{target:{value:'A holder for desk cables'}})
it('starts with help choices, a catalogue search and site-level links without a remote importer or iframe',async()=>{
  render(<Page/>);await screen.findByText(/Private uploads are unavailable/);fill()
  expect(screen.getByRole('link',{name:'Search the FIT print catalogue'})).toHaveAttribute('href','/prints?search=A%20holder%20for%20desk%20cables')
  expect(screen.getByRole('link',{name:'Open MakerWorld',hidden:true})).toHaveAttribute('href','https://makerworld.com/')
  expect(document.querySelector('iframe')).toBeNull();expect(global.fetch.mock.calls.some(([url])=>String(url).includes('import'))).toBe(false)
  expect(screen.getByRole('button',{name:'Send enquiry for a quote'})).toBeEnabled()
})
it.each([{creator:'farm'},{requestId:'old-request'},{mode:'advanced'}])('preserves an existing entry %j',params=>{state.params=params;render(<Page/>);expect(screen.getByText('Existing expert flow')).toBeInTheDocument()})
it('submits normalized size and copies without a payment call, then shows the saved reference',async()=>{
  global.fetch.mockImplementation(async(url,init)=>init?.method==='POST'?ok({requestId:'guided-fixture',status:'configured'}):ok({uploadsAvailable:false}))
  render(<GuidedPrintRequest/>);fill();fireEvent.change(screen.getByLabelText('How large should it be?'),{target:{value:'longest'}})
  fireEvent.change(screen.getByLabelText('Longest side'),{target:{value:'10'}});fireEvent.change(screen.getByLabelText('Units'),{target:{value:'cm'}})
  fireEvent.change(screen.getByLabelText('Number of copies'),{target:{value:'3'}});fireEvent.click(screen.getByRole('button',{name:'Send enquiry for a quote'}))
  await screen.findByText('Your print enquiry is saved');const calls=global.fetch.mock.calls.filter(([,init])=>init?.method==='POST');expect(calls).toHaveLength(1)
  expect(JSON.parse(calls[0][1].body).brief).toMatchObject({sizeMm:100,quantity:3,rights:'unknown',material:'help'})
})
it('retries the exact frozen body after an uncertain response',async()=>{
  let sent=0;global.fetch.mockImplementation(async(url,init)=>{if(init?.method==='POST'){if(++sent===1)throw Error('network unavailable');return ok({requestId:'guided-fixture'})}return ok({uploadsAvailable:false})})
  render(<GuidedPrintRequest/>);fill();fireEvent.click(screen.getByRole('button',{name:'Send enquiry for a quote'}));await screen.findByRole('alert')
  expect(screen.getByLabelText('Describe what you need')).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Retry the same enquiry'}));await screen.findByText('Your print enquiry is saved')
  const bodies=global.fetch.mock.calls.filter(([,init])=>init?.method==='POST').map(([,init])=>JSON.parse(init.body));expect(bodies[0].clientRequestId).toBe(bodies[1].clientRequestId);expect(bodies[0].brief).toEqual(bodies[1].brief)
})
it('rejects STEP and G-code without uploading or executing bytes',async()=>{
  render(<GuidedPrintRequest/>);await screen.findByText(/Private uploads are unavailable/)
  fireEvent.change(screen.getByLabelText('Attach a model (optional)'),{target:{files:[new File(['G28'],'test.gcode')]}})
  await screen.findByRole('alert');expect(global.fetch.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0)
})
it('keeps anonymous choices in this tab for sign-in',async()=>{
  state.user=null;render(<GuidedPrintRequest/>);fill();await waitFor(()=>expect(JSON.parse(sessionStorage.getItem('fit.guided-print.v1')).brief.purpose).toBe('A holder for desk cables'))
  expect(screen.getByRole('button',{name:'Sign in to send your enquiry'})).toBeInTheDocument()
})
