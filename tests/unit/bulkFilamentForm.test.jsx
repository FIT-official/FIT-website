import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import BulkFilamentForm from '@/components/Shop/BulkFilamentForm'
import BulkFilamentRequests from '@/components/Admin/BulkFilamentRequests'
import { fixtureCatalogue, fixtureInput, memoryStore } from '../fixtures/bulkFilament'
import { parseBulkInput, saveBulkRequest } from '@/lib/bulkFilament'
import { BULK_CONSENT } from '@/lib/bulkFilamentConfig'
vi.mock('next/link',()=>({default:({children,...props})=><a {...props}>{children}</a>}))
const catalogue=fixtureCatalogue()
const response=(body,status=200)=>({ok:status<400,status,json:async()=>body})
beforeEach(()=>{sessionStorage.clear();vi.stubGlobal('fetch',vi.fn(async()=>response({products:catalogue,stockSource:'snapshot',checkedAt:'2026-10-09'})))})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
async function choose(colour='Black',material='PLA') {
  await screen.findByRole('button',{name:'Add colour to enquiry'})
  const p=catalogue.find(p=>p.material===material)
  fireEvent.change(screen.getByLabelText('Product / material'),{target:{value:p.id}})
  fireEvent.change(screen.getByLabelText('Colour'),{target:{value:p.types[0].options.find(o=>o.name===colour).id}})
  fireEvent.click(screen.getByRole('button',{name:'Add colour to enquiry'}))
}
async function fill() {
  await choose();fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Synthetic QA'}})
  fireEvent.change(screen.getByLabelText('Email'),{target:{value:'qa@example.invalid'}})
  screen.getAllByRole('checkbox').forEach(c=>fireEvent.click(c))
}
it('shows configured ladders, optional phone and required consent',async()=>{
  render(<BulkFilamentForm/>);await choose()
  expect(screen.getByLabelText('Phone (optional)')).not.toBeRequired()
  expect(screen.getByLabelText(BULK_CONSENT)).toBeRequired()
  expect(screen.getByLabelText('Quantity line 1')).toHaveAttribute('max','14')
  expect(screen.getByText(/Inventory snapshot:/)).toBeInTheDocument()
  expect(screen.queryByText(/extra rolls/i)).not.toBeInTheDocument()
})
it('updates every PLA line when Marble crosses the mixed-colour tier; PETG is separate',async()=>{
  render(<BulkFilamentForm/>);await choose()
  fireEvent.change(screen.getByLabelText('Quantity line 1'),{target:{value:'6'}})
  await choose('Marble');fireEvent.change(screen.getByLabelText('Quantity line 2'),{target:{value:'4'}})
  await choose('Black','PETG');fireEvent.change(screen.getByLabelText('Quantity line 3'),{target:{value:'9'}})
  const regions=screen.getAllByRole('region',{name:/Request line/})
  expect(regions[0]).toHaveTextContent('10–19 (10 rolls combined)');expect(regions[0]).toHaveTextContent('83.40')
  expect(regions[1]).toHaveTextContent('18.90');expect(regions[1]).toHaveTextContent('75.60')
  expect(regions[2]).toHaveTextContent('<10 (9 rolls combined)');expect(regions[2]).toHaveTextContent('125.10')
  expect(screen.getByText(/Indicative total:/)).toHaveTextContent('284.10')
})
it.each([['Marble','PLA','8','7'],['Black','PETG','13','12']])('shows a cap error for %s %s',async(colour,material,quantity,cap)=>{
  render(<BulkFilamentForm/>);await choose(colour,material)
  fireEvent.change(screen.getByLabelText('Quantity line 1'),{target:{value:quantity}})
  expect(screen.getByRole('alert')).toHaveTextContent(`Choose 1 to ${cap} rolls`)
  expect(screen.getByRole('button',{name:'Send request to FIT'})).toBeDisabled()
})
it('does not add a duplicate selection',async()=>{
  render(<BulkFilamentForm/>);await choose();fireEvent.click(screen.getByRole('button',{name:'Add colour to enquiry'}))
  expect(screen.getByRole('alert')).toHaveTextContent('already in your request')
})
it('keeps quantities and requires review after refreshed inventory changes',async()=>{
  render(<BulkFilamentForm/>);await choose();fireEvent.change(screen.getByLabelText('Quantity line 1'),{target:{value:'6'}})
  const changed=structuredClone(catalogue);changed[0].version='a'.repeat(64);changed[0].types[0].options[0].stock=3
  fetch.mockResolvedValue(response({products:changed,stockSource:'sheet',checkedAt:'2026-10-09'}));fireEvent.focus(window)
  await screen.findByRole('button',{name:'I have reviewed the refreshed inventory'})
  expect(screen.getByLabelText('Quantity line 1')).toHaveValue(6)
  expect(screen.getByLabelText('Quantity line 1')).toHaveAttribute('max','3')
  expect(screen.getByRole('button',{name:'Send request to FIT'})).toBeDisabled()
})
it('submits without a phone and retries the exact payload after uncertain delivery',async()=>{
  render(<BulkFilamentForm/>);await fill();fetch.mockRejectedValueOnce(Error('Connection lost'))
  fireEvent.click(screen.getByRole('button',{name:'Send request to FIT'}));await screen.findByRole('button',{name:'Retry this request'})
  const first=fetch.mock.calls.at(-1)[1].body
  expect(JSON.parse(first)).toMatchObject({customer:{phone:''},consent:true})
  expect(JSON.parse(first).lines[0]).not.toHaveProperty('extraQuantity')
  expect(screen.getByLabelText('Name')).toBeDisabled()
  fetch.mockResolvedValue(response({requestId:'recovered',totalRolls:1}))
  fireEvent.click(screen.getByRole('button',{name:'Retry this request'}));await screen.findByText('recovered')
  expect(fetch.mock.calls.at(-1)[1].body).toBe(first)
  expect(screen.getByText(/No automatic email is sent to you/)).toBeInTheDocument()
})
it('shows inventory errors with a refresh action',async()=>{
  fetch.mockResolvedValue(response({error:'Inventory unavailable'},503));render(<BulkFilamentForm/>)
  expect(await screen.findByRole('alert')).toHaveTextContent('Inventory unavailable')
  expect(screen.getByRole('button',{name:'Refresh inventory'})).toBeEnabled()
})
it('admin displays the stored tier, unit price, line total and consent',async()=>{
  const store=memoryStore();await saveBulkRequest(store,parseBulkInput(fixtureInput(catalogue)),async()=>catalogue)
  fetch.mockResolvedValue(response({requests:[...store.docs.values()],next:null}))
  render(<BulkFilamentRequests/>);await screen.findByText('Synthetic QA')
  await waitFor(()=>expect(screen.getByText(/Unit price:/)).toHaveTextContent('SGD 14.90'))
  expect(screen.getByText(/Line total:/)).toHaveTextContent('SGD 29.80')
  expect(screen.getByText(/PLA band/)).toHaveTextContent('<10')
  expect(within(screen.getByRole('article')).getByText(/PDPA consent:/)).toHaveTextContent('Accepted')
})
