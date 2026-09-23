import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SubscriptionDetails from '@/components/Account/SubscriptionDetails'

const state = vi.hoisted(() => ({
  params: new URLSearchParams(), subscription: null, isLoaded: true, user: null,
  createToken: vi.fn(), confirmCardPayment: vi.fn(), getElement: vi.fn(), refresh: vi.fn(), showToast: vi.fn(),
}))
vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: state.user, isLoaded: state.isLoaded }) }))
vi.mock('@stripe/react-stripe-js', () => ({
  CardElement: () => <div aria-label="Card details field" />,
  useStripe: () => ({ createToken: state.createToken, confirmCardPayment: state.confirmCardPayment }),
  useElements: () => ({ getElement: state.getElement }),
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => state.params }))
vi.mock('@/utils/UserSubscriptionContext', () => ({ useUserSubscription: () => ({
  subscription: state.subscription, loading: false, error: null, refresh: state.refresh,
}) }))
vi.mock('@/components/General/ToastProvider', () => ({ useToast: () => ({ showToast: state.showToast }) }))

const variants = () => [
  { id: 'free', name: 'Free', amount: 0, currency: 'SGD', interval: 'month', available: true, priceId: null,
    limits: { products: 3, monthlyPrintRequests: 10 } },
  { id: 'standard', name: 'Standard', amount: 39, currency: 'SGD', interval: 'month', available: true, priceId: 'price_standard_month',
    limits: { products: 25, monthlyPrintRequests: 100 } },
  { id: 'standard', name: 'Standard', amount: 390, currency: 'SGD', interval: 'year', available: true, priceId: 'price_standard_year',
    annualSavings: 78, monthlyEquivalent: 32.5, limits: { products: 25, monthlyPrintRequests: 100 } },
  { id: 'pro', name: 'Pro', amount: 99, currency: 'SGD', interval: 'month', available: true, priceId: 'price_pro_month',
    limits: { products: 100, monthlyPrintRequests: 500 } },
  { id: 'pro', name: 'Pro', amount: 990, currency: 'SGD', interval: 'year', available: true, priceId: 'price_pro_year',
    annualSavings: 198, monthlyEquivalent: 82.5, limits: { products: 100, monthlyPrintRequests: 500 } },
]
const activeAnnual = extra => ({
  planId: 'standard', priceId: 'price_standard_year', interval: 'year', status: 'active', pending_update: null, ...extra,
})
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
const monthlyRadio = () => screen.getByRole('radio', { name: 'Pay monthly' })
const yearlyRadio = () => screen.getByRole('radio', { name: /Pay yearly.*2 months free/i })
const standardAnnual = () => screen.getByRole('radio', { name: /Standard.*S\$390\s*\/\s*year/i })
const proAnnual = () => screen.getByRole('radio', { name: /Pro.*S\$990\s*\/\s*year/i })
const consent = () => screen.getByRole('checkbox', { name: /S\$390 upfront for one year, renewing yearly/i })
const confirm = () => screen.getByRole('button', { name: 'Confirm subscription' })
let editResponse
let apiPlans
let calls

beforeEach(() => {
  vi.clearAllMocks()
  state.params = new URLSearchParams()
  state.subscription = null
  state.isLoaded = true
  state.user = { id: 'customer', reload: vi.fn().mockResolvedValue(undefined) }
  state.getElement.mockReturnValue({ kind: 'mock-card' })
  state.createToken.mockResolvedValue({ token: { id: 'tok_card' } })
  state.confirmCardPayment.mockResolvedValue({ paymentIntent: { status: 'succeeded' } })
  state.refresh.mockResolvedValue(activeAnnual())
  editResponse = response({ success: true })
  apiPlans = variants()
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
    calls.push({ url, ...options })
    if (url === '/api/stripe/plans') return response({ plans: apiPlans })
    if (url === '/api/user/subscription/edit') return editResponse
    throw new Error(`Unexpected request: ${url}`)
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

async function chooseAnnual() {
  await screen.findByRole('group', { name: 'Billing period' })
  await waitFor(() => expect(screen.getByRole('radio', { name: /Standard.*S\$39\s*\/\s*month/i })).toBeInTheDocument())
  fireEvent.click(yearlyRadio())
  fireEvent.click(standardAnnual())
}

async function beginAnnualPayment() {
  render(<SubscriptionDetails />)
  await chooseAnnual()
  fireEvent.click(consent())
  fireEvent.click(confirm())
}

describe('annual subscription selection and consent', () => {
  it('offers both billing periods from five flat variants and retains monthly usage limits', async () => {
    render(<SubscriptionDetails />)
    await screen.findByRole('radio', { name: /Standard.*S\$39\s*\/\s*month/i })
    const billing = screen.getByRole('group', { name: 'Billing period' })
    expect(within(billing).getAllByRole('radio')).toHaveLength(2)
    expect(monthlyRadio()).toBeChecked()
    expect(screen.getByRole('radio', { name: /Pro.*S\$99\s*\/\s*month/i })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Standard.*S\$390/ })).not.toBeInTheDocument()
    fireEvent.click(yearlyRadio())
    expect(yearlyRadio()).toBeChecked()
    expect(standardAnnual()).toBeInTheDocument()
    expect(proAnnual()).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(4) // two periods and two paid tiers
    expect(screen.getByText(/25 listings\s*\/\s*100 requests\/month/i)).toBeInTheDocument()
    expect(screen.getByText(/100 listings\s*\/\s*500 requests\/month/i)).toBeInTheDocument()
    expect(screen.getByText(/S\$32\.50\/month equivalent.*Save S\$78\/year/i)).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /^Free/ })).not.toBeInTheDocument()
  })

  it('requires consent to the full S$390 yearly charge and resets consent on interval changes', async () => {
    render(<SubscriptionDetails />)
    await chooseAnnual()
    expect(consent()).not.toBeChecked()
    expect(consent().closest('label')).not.toHaveTextContent('S$32.50 yearly')
    expect(confirm()).toBeDisabled()
    fireEvent.click(consent())
    expect(confirm()).toBeEnabled()
    fireEvent.click(monthlyRadio())
    fireEvent.click(screen.getByRole('radio', { name: /Standard.*S\$39\s*\/\s*month/i }))
    expect(screen.getByRole('checkbox', { name: /S\$39.*monthly recurring billing/i })).not.toBeChecked()
    expect(confirm()).toBeDisabled()
    expect(state.createToken).not.toHaveBeenCalled()
  })

  it('uses an incoming annual price ID ahead of the current monthly interval', async () => {
    state.subscription = { planId: 'standard', priceId: 'price_standard_month', interval: 'month', status: 'active' }
    state.params = new URLSearchParams('priceId=price_standard_year')
    render(<SubscriptionDetails />)
    await waitFor(() => expect(standardAnnual()).toBeChecked())
    expect(yearlyRadio()).toBeChecked()
    expect(consent()).not.toBeChecked()
  })

  it('keeps the purchased annual selection when refreshed account state changes after entering from a monthly link', async () => {
    state.subscription = { planId: 'standard', priceId: 'price_standard_month', interval: 'month', status: 'active' }
    state.params = new URLSearchParams('priceId=price_standard_month')
    const view = render(<SubscriptionDetails />)
    await waitFor(() => expect(screen.getByRole('radio', { name: /Standard.*S\$39\s*\/\s*month/i })).toBeChecked())
    fireEvent.click(yearlyRadio())
    expect(standardAnnual()).toBeChecked()
    fireEvent.click(consent())
    fireEvent.click(confirm())
    await waitFor(() => expect(state.showToast).toHaveBeenCalledWith('Your subscription is active.', 'success'))
    await act(async () => {
      state.subscription = activeAnnual()
      view.rerender(<SubscriptionDetails />)
    })
    expect(yearlyRadio()).toBeChecked()
    expect(standardAnnual()).toBeChecked()
    expect(consent()).not.toBeChecked()
    expect(calls.filter(call => call.url === '/api/stripe/plans')).toHaveLength(1)
    expect(JSON.parse(calls.find(call => call.url === '/api/user/subscription/edit').body).priceId).toBe('price_standard_year')
  })

  it('defaults the billing period to the existing yearly subscription without a price link', async () => {
    state.subscription = activeAnnual()
    render(<SubscriptionDetails />)
    await screen.findByRole('radio', { name: /Standard.*S\$390\s*\/\s*year/i })
    expect(yearlyRadio()).toBeChecked()
    expect(screen.queryByRole('radio', { name: /Standard.*S\$39\s*\/\s*month/i })).not.toBeInTheDocument()
  })

  it('does not reuse consent after switching to another yearly tier', async () => {
    render(<SubscriptionDetails />)
    await chooseAnnual()
    fireEvent.click(consent())
    fireEvent.click(proAnnual())
    expect(screen.getByRole('checkbox', { name: /S\$990 upfront for one year, renewing yearly/i })).not.toBeChecked()
    expect(confirm()).toBeDisabled()
  })

  it('does not offer unconfigured annual variants or keep a monthly charge selected in yearly mode', async () => {
    apiPlans = variants().map(plan => plan.interval === 'year' ? { ...plan, available: false } : plan)
    render(<SubscriptionDetails />)
    await screen.findByRole('radio', { name: /Standard.*S\$39\s*\/\s*month/i })
    fireEvent.click(screen.getByRole('radio', { name: /Standard.*S\$39\s*\/\s*month/i }))
    fireEvent.click(yearlyRadio())
    expect(screen.getByText(/Yearly billing is not available yet/i)).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(2)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm subscription' })).not.toBeInTheDocument()
    expect(state.createToken).not.toHaveBeenCalled()
  })

  it('submits only the selected annual price identifier and Stripe card token', async () => {
    await beginAnnualPayment()
    await waitFor(() => expect(state.showToast).toHaveBeenCalledWith('Your subscription is active.', 'success'))
    const requests = calls.filter(call => call.url === '/api/user/subscription/edit')
    expect(requests).toHaveLength(1)
    expect(requests[0].method).toBe('POST')
    expect(JSON.parse(requests[0].body)).toEqual({ priceId: 'price_standard_year', cardToken: 'tok_card' })
    expect(state.user.reload).toHaveBeenCalledTimes(1)
    expect(consent()).not.toBeChecked()
  })

  it('locks both billing periods, plan choices and consent while payment is outstanding', async () => {
    const token = deferred()
    state.createToken.mockReturnValue(token.promise)
    await beginAnnualPayment()
    await waitFor(() => expect(state.createToken).toHaveBeenCalledTimes(1))
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled()
    expect(consent()).toBeDisabled()
    expect(screen.getByRole('button', { name: /Confirming payment/i })).toBeDisabled()
    const user = userEvent.setup()
    await user.click(monthlyRadio())
    await user.click(proAnnual())
    expect(standardAnnual()).toBeChecked()
    await act(async () => { token.resolve({ token: { id: 'tok_card' } }); await token.promise })
    await waitFor(() => expect(state.showToast).toHaveBeenCalledWith('Your subscription is active.', 'success'))
    expect(JSON.parse(calls.find(call => call.url === '/api/user/subscription/edit').body).priceId).toBe('price_standard_year')
  })
})

describe('annual payment authentication confirmation', () => {
  beforeEach(() => { editResponse = response({ requires_action: true, clientSecret: 'pi_secret' }) })

  it('waits for an exact active yearly subscription after card authentication before reporting success', async () => {
    const refreshed = deferred()
    state.refresh.mockReturnValue(refreshed.promise)
    await beginAnnualPayment()
    await waitFor(() => expect(state.refresh).toHaveBeenCalledTimes(1))
    expect(state.confirmCardPayment).toHaveBeenCalledWith('pi_secret')
    expect(state.showToast).not.toHaveBeenCalled()
    expect(state.user.reload).not.toHaveBeenCalled()
    expect(standardAnnual()).toBeDisabled()
    await act(async () => { refreshed.resolve(activeAnnual()); await refreshed.promise })
    await waitFor(() => expect(state.showToast).toHaveBeenCalledWith('Your subscription is active.', 'success'))
    expect(state.user.reload).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each([
    ['old monthly price on the same tier', activeAnnual({ priceId: 'price_standard_month' })],
    ['wrong billing interval', activeAnnual({ interval: 'month' })],
    ['missing billing interval', activeAnnual({ interval: undefined })],
    ['different tier', activeAnnual({ planId: 'pro' })],
    ['incomplete payment', activeAnnual({ status: 'incomplete' })],
    ['past-due subscription', activeAnnual({ status: 'past_due' })],
    ['pending plan update', activeAnnual({ pending_update: { expires_at: 1790000000 } })],
    ['unavailable refreshed state', null],
  ])('does not claim annual activation for %s', async (_description, fresh) => {
    state.refresh.mockResolvedValue(fresh)
    await beginAnnualPayment()
    expect(await screen.findByRole('alert')).toHaveTextContent(/still being confirmed/i)
    expect(state.confirmCardPayment).toHaveBeenCalledWith('pi_secret')
    expect(state.showToast).not.toHaveBeenCalled()
    expect(state.user.reload).not.toHaveBeenCalled()
    expect(standardAnnual()).toBeEnabled()
  })

  it('shows authentication failure without claiming activation or refreshing subscription state', async () => {
    state.confirmCardPayment.mockResolvedValue({ error: { message: 'Authentication was cancelled.' } })
    await beginAnnualPayment()
    expect(await screen.findByRole('alert')).toHaveTextContent('Authentication was cancelled.')
    expect(state.refresh).not.toHaveBeenCalled()
    expect(state.showToast).not.toHaveBeenCalled()
    expect(state.user.reload).not.toHaveBeenCalled()
  })

  it('preserves support for a verified exact-price yearly trial', async () => {
    state.refresh.mockResolvedValue(activeAnnual({ status: 'trialing' }))
    await beginAnnualPayment()
    await waitFor(() => expect(state.showToast).toHaveBeenCalledWith('Your subscription is active.', 'success'))
    expect(state.user.reload).toHaveBeenCalledTimes(1)
  })
})

describe('annual payment response without additional authentication', () => {
  it.each([
    ['the old monthly price', activeAnnual({ priceId: 'price_standard_month' })],
    ['a monthly interval', activeAnnual({ interval: 'month' })],
    ['a pending update', activeAnnual({ pending_update: { expires_at: 1790000000 } })],
    ['an inactive subscription', activeAnnual({ status: 'incomplete' })],
  ])('does not treat a success response as annual activation with %s', async (_description, fresh) => {
    state.refresh.mockResolvedValue(fresh)
    await beginAnnualPayment()
    expect(await screen.findByRole('alert')).toHaveTextContent(/still being confirmed/i)
    expect(state.confirmCardPayment).not.toHaveBeenCalled()
    expect(state.refresh).toHaveBeenCalledTimes(1)
    expect(state.showToast).not.toHaveBeenCalled()
    expect(state.user.reload).not.toHaveBeenCalled()
  })
})
