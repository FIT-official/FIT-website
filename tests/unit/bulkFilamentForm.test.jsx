import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import BulkFilamentForm from '@/components/Shop/BulkFilamentForm'
import { bulkCatalogue } from '@/lib/bulkFilament'
import { fixtureProduct } from '../fixtures/bulkFilament'
vi.mock('next/link',()=>({default:({children,...props})=><a {...props}>{children}</a>}))
const catalogue=bulkCatalogue([fixtureProduct()])
const response=(body,status=200)=>({ok:status<400,status,json:async()=>body})
beforeEach(()=>{sessionStorage.clear();vi.stubGlobal('fetch',vi.fn(async()=>response({products:catalogue,checkedAt:'2026-10-09T01:00:00Z'})))})
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
async function choose(){await screen.findByRole('option',{name:'Synthetic PLA rolls'});fireEvent.change(screen.getByLabelText('Product / material'),{target:{value:catalogue[0].id}});fireEvent.click(screen.getByRole('button',{name:'Add selection'}))}
async function fill(){
  await choose();fireEvent.change(screen.getByLabelText('Recorded rolls line 1'),{target:{value:'2'}});fireEvent.change(screen.getByLabelText('Extra rolls line 1'),{target:{value:'20'}})
  fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Synthetic QA'}});fireEvent.change(screen.getByLabelText('Email'),{target:{value:'qa@example.invalid'}});fireEvent.change(screen.getByLabelText('Phone'),{target:{value:'+65 8000 0000'}})
  fireEvent.click(screen.getByRole('checkbox'))
}
it('shows separate recorded and extra quantities with no payment promise',async()=>{
  render(<BulkFilamentForm/>);await choose()
  expect(screen.getByLabelText('Extra rolls line 1')).toHaveAttribute('max','20')
  expect(screen.getByLabelText('Recorded rolls line 1')).toHaveAttribute('max','5')
  expect(screen.getByText(/No payment and no stock reservation/)).toBeInTheDocument()
})
it('does not add a duplicate selection',async()=>{render(<BulkFilamentForm/>);await choose();fireEvent.click(screen.getByRole('button',{name:'Add selection'}));expect(screen.getByRole('alert')).toHaveTextContent('already in your request');expect(screen.getAllByRole('region',{name:/Request line/})).toHaveLength(1)})
it('shows an accessible inventory failure and retry',async()=>{fetch.mockResolvedValue(response({error:'Inventory unavailable'},503));render(<BulkFilamentForm/>);expect(await screen.findByRole('alert')).toHaveTextContent('Inventory unavailable');expect(screen.getByRole('button',{name:'Refresh inventory'})).toBeEnabled()})
it('renders a clear successful request receipt and exact notification coverage',async()=>{
  render(<BulkFilamentForm/>);await fill();fetch.mockResolvedValue(response({requestId:'synthetic-reference',recordedRolls:2,extraRolls:20},201))
  fireEvent.click(screen.getByRole('button',{name:'Send request to FIT'}))
  expect(await screen.findByText('Your filament request is with FIT')).toBeInTheDocument();expect(screen.getByText('synthetic-reference')).toBeInTheDocument()
  expect(screen.getByText(/An email or Telegram confirmation is not sent automatically/)).toBeInTheDocument()
})
it('retries the exact same payload and reference after uncertain delivery',async()=>{
  render(<BulkFilamentForm/>);await fill();fetch.mockRejectedValueOnce(Error('Connection lost'))
  fireEvent.click(screen.getByRole('button',{name:'Send request to FIT'}));await screen.findByRole('button',{name:'Retry this request'})
  const first=fetch.mock.calls.at(-1)[1].body
  expect(screen.getByLabelText('Name')).toBeDisabled()
  fetch.mockResolvedValue(response({requestId:'recovered',recordedRolls:2,extraRolls:20}))
  fireEvent.click(screen.getByRole('button',{name:'Retry this request'}))
  await screen.findByText('recovered');expect(fetch.mock.calls.at(-1)[1].body).toBe(first)
})
it('requires review after the server returns changed inventory',async()=>{
  render(<BulkFilamentForm/>);await fill()
  const changed=structuredClone(catalogue);changed[0].version='a'.repeat(64)
  fetch.mockResolvedValueOnce(response({error:'Inventory changed',code:'inventory_changed'},409)).mockResolvedValueOnce(response({products:changed,checkedAt:'2026-10-09T02:00:00Z'}))
  fireEvent.click(screen.getByRole('button',{name:'Send request to FIT'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'I have reviewed the refreshed inventory'})).toBeInTheDocument())
  expect(screen.getByRole('button',{name:'Send request to FIT'})).toBeDisabled()
})
