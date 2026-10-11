import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import BulkFilamentForm from '@/components/Shop/BulkFilamentForm'
import { parseBulkInput, prepareBulkLines } from '@/lib/bulkFilament'
import { fixtureCatalogue } from '../fixtures/bulkFilament'
vi.mock('next/link',()=>({default:({children,...props})=><a {...props}>{children}</a>}))
afterEach(()=>{cleanup();vi.unstubAllGlobals();sessionStorage.clear()})
it('updates mixed-material enquiry lines and removal totals with server parity',async()=>{
  sessionStorage.clear()
  const catalogue=fixtureCatalogue()
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({products:catalogue,stockSource:'snapshot',checkedAt:'synthetic'})})))
  render(<BulkFilamentForm/>)
  await screen.findByRole('button',{name:'Add colour to enquiry'})
  const choose=material=>{const p=catalogue.find(p=>p.material===material);fireEvent.change(screen.getByLabelText('Product / material'),{target:{value:p.id}});fireEvent.click(screen.getByRole('button',{name:'Add colour to enquiry'}))}
  choose('PLA');fireEvent.change(screen.getByLabelText('Quantity line 1'),{target:{value:'4'}})
  choose('PETG');fireEvent.change(screen.getByLabelText('Quantity line 2'),{target:{value:'6'}})
  let sections=screen.getAllByRole('region',{name:/Request line/})
  expect(sections[0]).toHaveTextContent('$13.90 / roll x 4 = $55.60')
  expect(sections[1]).toHaveTextContent('$13.40 / roll x 6 = $80.40')
  expect(screen.getByText(/Indicative total:/)).toHaveTextContent('$136.00')
  fireEvent.change(screen.getByLabelText('Quantity line 2'),{target:{value:'5'}})
  expect(sections[0]).toHaveTextContent('$14.90 / roll x 4 = $59.60')
  expect(sections[1]).toHaveTextContent('$13.90 / roll x 5 = $69.50')
  fireEvent.click(screen.getByRole('button',{name:'Remove line 2'}))
  expect(screen.getAllByRole('region',{name:/Request line/})).toHaveLength(1)
  expect(screen.getByText(/Indicative total:/)).toHaveTextContent('$59.60')
  choose('PETG');fireEvent.change(screen.getByLabelText('Quantity line 2'),{target:{value:'6'}})
  fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Synthetic QA'}});fireEvent.change(screen.getByLabelText('Email'),{target:{value:'qa@example.invalid'}})
  screen.getAllByRole('checkbox').forEach(c=>fireEvent.click(c))
  let quoted
  fetch.mockImplementationOnce(async(_url,init)=>{const input=parseBulkInput(JSON.parse(init.body));quoted=prepareBulkLines(input,catalogue);return {ok:true,json:async()=>({requestId:input.clientRequestId,totalRolls:10,ownerEmailStatus:'not_configured'})}})
  fireEvent.click(screen.getByRole('button',{name:'Send request to FIT'}))
  await screen.findByText('Your filament request is with FIT')
  expect(quoted.find(l=>l.material==='PLA')).toMatchObject({quantity:4,unitCents:1390,lineCents:5560,tierRolls:10})
  expect(quoted.find(l=>l.material==='PETG')).toMatchObject({quantity:6,unitCents:1340,lineCents:8040,tierRolls:10})
})

