import {afterEach,expect,it,vi} from 'vitest'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import BusinessReportsPanel from '@/components/Admin/BusinessReportsPanel'
const report={period:{label:'Synthetic Singapore period'},coverage:{partial:true,notes:'Gross recorded paid amounts.'},kinds:{'order.paid':3,'enquiry.submitted':4,'chat.message.new':5},currencies:{SGD:{orders:3,grossPaidMinor:1234,items:6}},visitors:{available:false}}
const payload={report,configuration:{enabled:false,ownerEmail:'fixittoday.contact@gmail.com',telegramConfigured:false},health:{counts:{accepted:2,uncertain:1}}}
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
it('shows disabled state, visitor unavailability, summary and private downloads honestly',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>payload})));render(<BusinessReportsPanel/>);await screen.findByText(/have not been activated/)
  expect(screen.getByText('Unavailable')).toBeTruthy();expect(screen.getByText(/SGD 12.34 gross paid/)).toBeTruthy()
  expect(screen.getByRole('link',{name:'Download event CSV'}).getAttribute('href')).toContain('download=events.csv')
  expect(screen.getByText(/uncertain: 1/)).toBeTruthy()
})
it('reloads a chosen period and changes the export links',async()=>{
  const fetchMock=vi.fn(async()=>({ok:true,json:async()=>payload}));vi.stubGlobal('fetch',fetchMock);render(<BusinessReportsPanel/>);await screen.findByText(/have not been activated/)
  fireEvent.change(screen.getByLabelText('Business report period'),{target:{value:'monthly'}})
  await waitFor(()=>expect(fetchMock).toHaveBeenCalledTimes(2));await screen.findByText(/have not been activated/)
  expect(screen.getByRole('link',{name:'Download summary JSON'}).getAttribute('href')).toContain('period=monthly')
})
it('replaces failed metrics with a retryable error instead of fabricated zeros',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:false})));render(<BusinessReportsPanel/>);expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.queryByText('Paid orders')).toBeNull()
})
