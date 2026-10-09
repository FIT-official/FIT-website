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
async function choose(){await screen.findByRole('option',{name:'Synthetic PLA rolls'});fireEvent.change(screen.getByLabelText('Product / material'),{target:{value:catalogue[0].id}});fireEvent.click(screen.getByRole('button',{name:'Add colour to enquiry'}))}
async function fill(){
  await choose();fireEvent.change(screen.getByLabelText('Quantity line 1'),{target:{value:'22'}})
  fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Synthetic QA'}});fireEvent.change(screen.getByLabelText('Email'),{target:{value:'qa@example.invalid'}});fireEvent.change(screen.getByLabelText('Phone'),{target:{value:'+65 8000 0000'}})
  fireEvent.click(screen.getByRole('checkbox'))
}
it('shows one total quantity per colour with no payment promise',async()=>{
  render(<BulkFilamentForm/>);await choose()
  expect(screen.getByLabelText('Quantity line 1')).toHaveAttribute('max','25')
  expect(screen.getAllByRole('spinbutton')).toHaveLength(1)
  expect(screen.queryByText(/Extra rolls to check/)).not.toBeInTheDocument()
  expect(screen.getByText(/No payment and no stock reservation/)).toBeInTheDocument()
})
it('does not add a duplicate selection',async()=>{render(<BulkFilamentForm/>);await choose();fireEvent.click(screen.getByRole('button',{name:'Add colour to enquiry'}));expect(screen.getByRole('alert')).toHaveTextContent('already in your request');expect(screen.getAllByRole('region',{name:/Request line/})).toHaveLength(1)})
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

it('defaults to the first canonical product and adds another colour without changing earlier quantities',async()=>{
  render(<BulkFilamentForm/>);await screen.findByRole('button',{name:'Add colour to enquiry'})
  expect(screen.getByLabelText('Product / material')).toHaveValue(catalogue[0].id)
  fireEvent.click(screen.getByRole('button',{name:'Add colour to enquiry'}))
  fireEvent.change(screen.getByLabelText('Quantity line 1'),{target:{value:'8'}})
  fireEvent.click(screen.getByRole('button',{name:'Add another colour'}))
  expect(screen.getByLabelText('Product / material')).toHaveFocus()
  fireEvent.click(screen.getByRole('button',{name:'Add colour to enquiry'}))
  fireEvent.change(screen.getByLabelText('Quantity line 2'),{target:{value:'3'}})
  expect(screen.getByLabelText('Quantity line 1')).toHaveValue(8)
  expect(screen.getByText('Colour: White · Spool: Refill (no spool)')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Remove line 1'}))
  expect(screen.getAllByRole('spinbutton')).toHaveLength(1)
  expect(screen.getByLabelText('Quantity line 1')).toHaveValue(3)
})
it('submits two colours and retries the exact two-line quantity payload after a lost response',async()=>{
  render(<BulkFilamentForm/>);await fill()
  fireEvent.click(screen.getByRole('button',{name:'Add another colour'}))
  fireEvent.click(screen.getByRole('button',{name:'Add colour to enquiry'}))
  fireEvent.change(screen.getByLabelText('Quantity line 2'),{target:{value:'4'}})
  fetch.mockRejectedValueOnce(Error('Connection lost'))
  fireEvent.click(screen.getByRole('button',{name:'Send request to FIT'}));await screen.findByRole('button',{name:'Retry this request'})
  const first=fetch.mock.calls.at(-1)[1].body, input=JSON.parse(first)
  expect(input.lines.map(l=>l.quantity)).toEqual([22,4]);expect(input.lines[0]).not.toHaveProperty('extraQuantity')
  expect(input.lines[0].options).not.toEqual(input.lines[1].options)
  fetch.mockResolvedValue(response({requestId:'two-colour-recovered',totalRolls:26}))
  fireEvent.click(screen.getByRole('button',{name:'Retry this request'}));await screen.findByText('two-colour-recovered')
  expect(fetch.mock.calls.at(-1)[1].body).toBe(first)
  expect(screen.getByText('26 rolls requested')).toBeInTheDocument()
})
it.each([0,2,10])('refreshes changed stock %s on focus while preserving two colours and quantities',async stock=>{
  render(<BulkFilamentForm/>);await choose()
  fireEvent.change(screen.getByLabelText('Quantity line 1'),{target:{value:'24'}})
  fireEvent.click(screen.getByRole('button',{name:'Add another colour'}));fireEvent.click(screen.getByRole('button',{name:'Add colour to enquiry'}))
  fireEvent.change(screen.getByLabelText('Quantity line 2'),{target:{value:'3'}})
  const product=fixtureProduct();product.variantTypes[0].options[0].stock=stock
  product.variantTypes[1].options[0].stock=20
  fetch.mockResolvedValue(response({products:bulkCatalogue([product]),checkedAt:'2026-10-09T02:00:00Z'}))
  fireEvent.focus(window)
  await screen.findByRole('button',{name:'I have reviewed the refreshed inventory'})
  expect(screen.getByLabelText('Quantity line 1')).toHaveValue(24)
  expect(screen.getByLabelText('Quantity line 2')).toHaveValue(3)
  expect(screen.getByLabelText('Quantity line 1')).toHaveAttribute('max',String(stock+20))
  expect(screen.getByRole('button',{name:'Send request to FIT'})).toBeDisabled()
  expect(fetch.mock.calls.at(-1)[1]).toEqual({cache:'no-store'})
})
it('displays the two exact user-supplied notices',async()=>{
  render(<BulkFilamentForm/>);await choose()
  expect(screen.getByText('I understand this is an enquiry for review. All stock, extra rolls, final pricing and fulfilment need confirmation. No rolls are reserved, no payment is taken and no delivery date is confirmed.')).toBeInTheDocument()
  expect(screen.getByText(/Your contact details are shared with the FIT for this enquiry\./)).toBeInTheDocument()
  expect(screen.queryByText(/20 (additional|extra)/)).not.toBeInTheDocument()
})

it('shows separate spool choices and remaining counts, and refreshes both without changing selections',async()=>{
  const product=fixtureProduct();product.name='Bambu Lab synthetic PLA';product.variantTypes[1].options[0].stock=6;product.variantTypes[1].options[1].stock=0
  fetch.mockResolvedValue(response({products:bulkCatalogue([product])}));render(<BulkFilamentForm/>)
  const refill=await screen.findByRole('radio',{name:'Refill (no spool) 6 rolls recorded remaining'})
  expect(refill).toBeChecked();fireEvent.click(screen.getByRole('button',{name:'Add colour to enquiry'}))
  fireEvent.click(screen.getByRole('radio',{name:'With spool 0 rolls recorded remaining'}));fireEvent.click(screen.getByRole('button',{name:'Add colour to enquiry'}))
  expect(screen.getAllByRole('spinbutton')).toHaveLength(2)
  expect(screen.getByLabelText('Quantity line 2')).toHaveAttribute('max','20')
  expect(screen.getByText('Colour: Black · Spool: With spool')).toBeInTheDocument()
  product.variantTypes[1].options[0].stock=2;product.variantTypes[1].options[1].stock=4
  fetch.mockResolvedValue(response({products:bulkCatalogue([product])}));fireEvent.focus(window)
  await screen.findByRole('radio',{name:'Refill (no spool) 2 rolls recorded remaining'})
  expect(screen.getByRole('radio',{name:'With spool 4 rolls recorded remaining'})).toBeChecked()
  expect(screen.getByLabelText('Quantity line 1')).toHaveAttribute('max','22')
  expect(screen.getByLabelText('Quantity line 2')).toHaveAttribute('max','24')
  expect(screen.getByLabelText('Quantity line 2')).toHaveValue(1)
})

it('retains the exact legacy pending retry but uses one quantity after an inventory rejection',async()=>{
  const legacy={clientRequestId:'12345678-1234-4234-8234-123456789abc',customer:{name:'Synthetic',email:'qa@example.invalid',phone:'+65 8000 0000'},fulfilment:'collection',address:'',notes:'',confirmReview:true,lines:[{productId:catalogue[0].id,version:catalogue[0].version,options:catalogue[0].types.map(t=>({typeId:t.id,optionId:t.options[0].id})),recordedQuantity:2,extraQuantity:3,remarks:''}]}
  sessionStorage.setItem('fit-bulk-filament-pending-v1',JSON.stringify({input:legacy}));render(<BulkFilamentForm/>);await screen.findByRole('option',{name:'Synthetic PLA rolls'})
  expect(screen.getByLabelText('Quantity line 1')).toHaveValue(5)
  fetch.mockResolvedValueOnce(response({error:'Inventory changed',code:'inventory_changed'},409)).mockResolvedValueOnce(response({products:catalogue}))
  fireEvent.click(screen.getByRole('button',{name:'Retry this request'}));await screen.findByRole('button',{name:'Send request to FIT'})
  expect(JSON.parse(fetch.mock.calls.find(([,o])=>o?.method==='POST')[1].body)).toEqual(legacy)
  fetch.mockResolvedValueOnce(response({requestId:'converted',totalRolls:5}))
  fireEvent.click(screen.getByRole('button',{name:'Send request to FIT'}));await screen.findByText('converted')
  const sent=JSON.parse(fetch.mock.calls.at(-1)[1].body).lines[0]
  expect(sent.quantity).toBe(5);expect(sent).not.toHaveProperty('recordedQuantity');expect(sent).not.toHaveProperty('extraQuantity')
})

it('calculates approved pooled category discounts and totals as colour quantities change without adding client price fields',async()=>{
  const product=fixtureProduct();product.name='1kg PLA 3D Printing Filament - Lanbo';product.slug='1kg-pla-3d-printing-filament-lanbo';product.basePrice.presentmentAmount=14.9;product.discount={percentage:99}
  fetch.mockResolvedValue(response({products:bulkCatalogue([product])}));render(<BulkFilamentForm/>);await screen.findByRole('button',{name:'Add colour to enquiry'})
  fireEvent.click(screen.getByRole('button',{name:'Add colour to enquiry'}));fireEvent.change(screen.getByLabelText('Quantity line 1'),{target:{value:'4'}})
  fireEvent.click(screen.getByRole('radio',{name:'White',exact:true}));fireEvent.click(screen.getByRole('button',{name:'Add colour to enquiry'}));fireEvent.change(screen.getByLabelText('Quantity line 2'),{target:{value:'6'}})
  expect(screen.getByRole('region',{name:'Filament estimate'})).toHaveTextContent('Subtotal: $149.00Discount: −$10.00$139.00')
  expect(screen.getByRole('region',{name:'Request line 1'})).toHaveTextContent('Estimated line total$55.60')
  expect(screen.getByRole('region',{name:'Request line 2'})).toHaveTextContent('Estimated line total$83.40')
  fireEvent.click(screen.getByRole('button',{name:'Remove line 1'}));expect(screen.getByRole('region',{name:'Filament estimate'})).toHaveTextContent('$89.40')
})
it('shows estimates without unnecessary discount notices when no approved rate exists',async()=>{
  render(<BulkFilamentForm/>);await choose();fireEvent.change(screen.getByLabelText('Quantity line 1'),{target:{value:'3'}})
  expect(screen.getByRole('region',{name:'Filament estimate'})).toHaveTextContent('Estimated grand total$30.00')
  expect(screen.queryByText(/no discount|Discount:/i)).not.toBeInTheDocument()
})
