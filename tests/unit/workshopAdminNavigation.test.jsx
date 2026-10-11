import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
const h = vi.hoisted(() => ({ admin: true, tab: 'workshop', calls: [], fetch: vi.fn() }))
vi.mock('@/utils/useAccess', () => ({ default: () => ({ isAdmin: h.admin, loading: false }) }))
vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: { firstName: 'Synthetic teacher' } }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams({ tab: h.tab }) }))
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }))
vi.mock('next/image', () => ({ default: ({ alt }) => <span role="img" aria-label={alt} /> }))
vi.mock('@/components/dashboard-ui', () => ({ DashProvider: ({children}) => <div>{children}</div>, HeroGreeting: () => null, EmptyState: ({title}) => <h1>{title}</h1>, CommandPalette: () => null, ShortcutsSheet: () => null, SkeletonTile: () => null }))
vi.mock('@/components/Workshop/useClassPolling', async () => { const {useEffect,useRef}=await import('react'); return {useClassPolling:fn=>{ h.refresh=fn; const f=useRef(fn); useEffect(()=>{f.current()},[]) }} })
vi.mock('@/components/Workshop/TeacherTinkercad', () => ({ default: () => null }))
vi.mock('@/components/Workshop/TeacherBackup', () => ({ default: () => null }))
vi.mock('@/components/Admin/DynamicContentManagement', () => ({ default: () => null }))
vi.mock('@/components/Admin/BlogManagement', () => ({ default: () => null }))
vi.mock('@/components/Admin/NewsletterManagement', () => ({ default: () => null }))
vi.mock('@/components/Admin/CreatorPayments', () => ({ default: () => null }))
vi.mock('@/components/Admin/CategoryManagement', () => ({ default: () => null }))
vi.mock('@/components/Admin/DeliveryTypeManagement', () => ({ default: () => null }))
vi.mock('@/components/Admin/OrderStatusManagement', () => ({ default: () => null }))
vi.mock('@/components/Admin/CustomPrintProductManagement', () => ({ default: () => null }))
vi.mock('@/components/Admin/CustomPrintRequests', () => ({ default: () => null }))
vi.mock('@/components/Admin/PrinterRepairManagement', () => ({ default: () => null }))
vi.mock('@/components/Community/CommunityModeration', () => ({ default: () => null }))
vi.mock('@/components/Admin/BulkFilamentRequests', () => ({ default: () => null }))
vi.mock('@/components/Admin/QuotingPricingManagement', () => ({ default: () => null }))
vi.mock('@/components/Admin/PrintTimeCalibration', () => ({ default: () => null }))
vi.mock('@/components/Admin/ReviewManagement', () => ({ default: () => null }))
vi.mock('@/components/Admin/CustomersPanel', () => ({ default: () => null }))
vi.mock('@/components/Admin/CreatorSubscriptions', () => ({ default: () => null }))
vi.mock('@/components/DashboardComponents/NotificationsBell', () => ({ default: () => null }))
vi.mock('@/components/Admin/EventManagement', () => ({ default: () => null }))
vi.mock('@/components/Admin/Overview', () => ({ default: () => null }))
vi.mock('@/components/Admin/OnboardingWizard', () => ({ default: () => null }))
import AdminPage from '@/app/admin/page'
import TeacherPage from '@/app/admin/workshop/page'
import { emptyLesson, classroomView } from '@/lib/workshopGuestClassroomStore'
let state
beforeEach(() => {
 h.admin=true;h.calls=[];h.tab='workshop';localStorage.setItem('adminOnboardingDismissed','1')
 state={...emptyLesson(), version:86, phase:'REFINE', entryOpen:false, feedbackOpen:true, refinementOpen:true, showFeedback:true}
 vi.stubGlobal('fetch',h.fetch)
 h.fetch.mockImplementation(async (url,options={})=>{
  h.calls.push({url,method:options.method||'GET',body:options.body})
  if(url==='/api/admin/workshop/guest'){
   if(options.method==='PATCH'){const input=JSON.parse(options.body);expect(input).toEqual({action:'entry',expectedVersion:86,entryOpen:true});state={...state,entryOpen:true,version:87}}
   return new Response(JSON.stringify({...classroomView(state,{role:'teacher',userId:'synthetic-admin'}),entryOpen:state.entryOpen}))
  }
  if(url==='/api/admin/workshop')return new Response(JSON.stringify({error:'Legacy controller requested by current-class navigation.'}),{status:409})
  return new Response('{}')
 })
})
afterEach(()=>{cleanup();vi.unstubAllGlobals();localStorage.clear()})
it.each([['Admin Live Class tab',AdminPage],['direct teacher route',TeacherPage]])('%s loads the same current classroom and opens entry only on a teacher action',async(_,Page)=>{
 render(<Page/>);expect(await screen.findByRole('heading',{name:'Class student work'})).toBeInTheDocument()
 expect(h.calls.some(c=>c.url==='/api/admin/workshop')).toBe(false)
 expect(h.calls.some(c=>c.method!=='GET')).toBe(false)
 fireEvent.click(document.querySelector('details > summary'))
 fireEvent.click(screen.getByRole('button',{name:'Open student entry'}))
 await waitFor(()=>expect(screen.getByRole('button',{name:'Close student entry'})).toBeInTheDocument())
 expect(h.calls.filter(c=>c.method==='PATCH')).toHaveLength(1)
})
it('does not mount class controls or request class data for a nonadmin',async()=>{
 h.admin=false;render(<AdminPage/>);await waitFor(()=>expect(screen.queryByText('Loading teacher controls.')).not.toBeInTheDocument())
 expect(h.calls.filter(c=>c.url.includes('workshop'))).toHaveLength(0)
 expect(screen.queryByRole('button',{name:'Open student entry'})).not.toBeInTheDocument()
})

it('backs off failed teacher reads without presenting authentication failure or discarding an already loaded lesson',async()=>{
 render(<TeacherPage/>);await screen.findByRole('heading',{name:'Class student work'})
 h.fetch.mockResolvedValue(new Response(JSON.stringify({error:'Class service unavailable. Your draft is kept; please retry.'}),{status:503}))
 let result;await act(async()=>{result=await h.refresh()})
 expect(result).toBe(false);expect(screen.getByRole('heading',{name:'Class student work'})).toBeInTheDocument()
 expect(screen.getByText('Class service unavailable. Your draft is kept; please retry.')).toHaveAttribute('role', 'status')
})
