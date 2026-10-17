import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
import {
  render,
  screen,
  cleanup,
  waitFor,
  within,
} from '@testing-library/react'
import Dashboard from '@/app/dashboard/Dashboard'
import DashboardPage from '@/app/dashboard/DashboardPage'
import DashboardHome from '@/app/dashboard/page'
import CreatorShell from '@/components/DashboardComponents/CreatorShell'

// Entitlements: creator by default.
const entitlementsState = {
  loading: false,
  canAccessDashboard: true,
  canUseMessaging: true,
}

vi.mock('@/utils/useEntitlements', () => ({
  default: () => entitlementsState,
}))

// jsdom has no ResizeObserver.
global.ResizeObserver = global.ResizeObserver || class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let mockUser = null

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    user: mockUser,
    isLoaded: true,
  }),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}))

vi.mock('@/utils/useAccess', () => ({
  default: () => ({
    loading: false,
    canAccess: true,
    isAdmin: false,
  }),
}))

vi.mock('@/components/General/ToastProvider', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
  ToastProvider: ({ children }) => children,
}))

vi.mock('@/utils/useOrderStatuses', () => ({
  useOrderStatuses: orderType => ({
    orderStatuses:
      orderType === 'printOrder'
        ? [
            {
              statusKey: 'pending_config',
              displayName: 'Pending Config',
              isActive: true,
              order: 1,
            },
          ]
        : [
            {
              statusKey: 'pending',
              displayName: 'Pending',
              isActive: true,
              order: 1,
            },
            {
              statusKey: 'successful',
              displayName: 'Successful',
              isActive: true,
              order: 2,
            },
          ],
    loading: false,
    error: null,
  }),
  getStatusDisplayName: (key, statuses) =>
    statuses.find(
      status => status.statusKey === key
    )?.displayName || key,
  getStatusColor: () => '#6b7280',
}))

const okJson = data =>
  Promise.resolve({
    ok: true,
    json: async () => data,
  })

const failJson = () =>
  Promise.resolve({
    ok: false,
    json: async () => ({}),
  })

function stubFetch({
  products = [],
  displayName,
  inbox,
  orderUsers = [],
  chatSettings,
  express,
  termsAccepted = false,
} = {}) {
  globalThis.fetch = vi.fn(url => {
    const u = String(url)

    if (u.startsWith('/api/product')) {
      return okJson({ products })
    }

    if (u.startsWith('/api/user/display-name')) {
      return displayName === undefined
        ? failJson()
        : okJson({ displayName })
    }

    if (u.startsWith('/api/chat/inbox')) {
      return inbox
        ? okJson(inbox)
        : failJson()
    }

    if (u.startsWith('/api/chat/settings')) {
      return chatSettings
        ? okJson(chatSettings)
        : failJson()
    }

    if (u.startsWith('/api/user/orders')) {
      return okJson(orderUsers)
    }

    if (u.startsWith('/api/user/express')) {
      return okJson(express || {})
    }

    if (u.startsWith('/api/terms/accept')) {
      return okJson({
        accepted: termsAccepted,
      })
    }

    return failJson()
  })
}

const originalFetch = globalThis.fetch

beforeEach(() => {
  mockUser = {
    id: 'user_1',
    firstName: null,
    createdAt: '2024-01-01T00:00:00Z',
    publicMetadata: {},
  }

  entitlementsState.loading = false
  entitlementsState.canAccessDashboard = true
  entitlementsState.canUseMessaging = true

  localStorage.clear()

  stubFetch()
})

const renderHome = (props = {}) =>
  render(
    <CreatorShell>
      <Dashboard {...props} />
    </CreatorShell>
  )

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  globalThis.fetch = originalFetch
})

describe('creator walkthrough dashboard mounting', () => {
  it('renders neither new component with default props', async () => {
    renderHome()

    expect(
      screen.queryByRole('heading', {
        name: 'Creator walkthrough',
      })
    ).not.toBeInTheDocument()

    expect(
      screen.queryByRole('heading', {
        name: 'How fees work',
      })
    ).not.toBeInTheDocument()

    expect(
      document.getElementById('fees')
    ).toBeNull()

    expect(
      screen.queryByRole('region', {
        name: 'Creator Terms',
      })
    ).not.toBeInTheDocument()

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/product?creatorUserId=user_1'
      )
    })
  })

  it('mounts both components when creatorWalkthrough is true', async () => {
    renderHome({
      creatorWalkthrough: true,
    })

    expect(
      screen.getByRole('heading', {
        name: 'Creator walkthrough',
      })
    ).toBeInTheDocument()

    expect(
      screen.getByText('Step 1 of 6')
    ).toBeInTheDocument()

    expect(
      screen.getByRole('heading', {
        name: 'How fees work',
      })
    ).toBeInTheDocument()

    expect(
      screen.queryByRole('region', {
        name: 'Creator Terms',
      })
    ).not.toBeInTheDocument()

    const fees = document.getElementById('fees')

    expect(fees).not.toBeNull()

    expect(
      within(fees).getByRole('heading', {
        name: 'How fees work',
      })
    ).toBeInTheDocument()

    const stripe = document.getElementById(
      'stripe-payouts'
    )

    expect(stripe).not.toBeNull()

    expect(stripe.nextElementSibling).toBe(fees)

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/product?creatorUserId=user_1'
      )
    })
  })

  it('places the walkthrough before the setup checklist', async () => {
    renderHome({
      creatorWalkthrough: true,
    })

    const walkthroughHeading = screen.getByRole(
      'heading',
      { name: 'Creator walkthrough' }
    )

    const checklistHeading = await screen.findByText(
      'Set up your shop'
    )

    expect(
      walkthroughHeading.compareDocumentPosition(
        checklistHeading
      ) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('leaves CreatorTermsCard unchanged when only Terms acceptance is required', async () => {
    renderHome({
      creatorTermsRequired: true,
      creatorWalkthrough: false,
    })

    expect(
      screen.queryByRole('heading', {
        name: 'Creator walkthrough',
      })
    ).not.toBeInTheDocument()

    expect(
      screen.queryByRole('heading', {
        name: 'How fees work',
      })
    ).not.toBeInTheDocument()

    expect(
      document.getElementById('fees')
    ).toBeNull()

    const termsRegion = screen.getByRole(
      'region',
      { name: 'Creator Terms' }
    )

    expect(
      within(termsRegion).getByRole('checkbox')
    ).toBeInTheDocument()

    expect(
      within(termsRegion).getByRole('link', {
        name: 'Creator Terms',
      })
    ).toHaveAttribute('href', '/creator-terms')

    expect(
      within(termsRegion).getByRole('button', {
        name: 'Accept Creator Terms',
      })
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/terms/accept',
        expect.objectContaining({
          cache: 'no-store',
          signal: expect.any(AbortSignal),
        })
      )
    })
  })

  it('supports both independent features simultaneously', async () => {
    renderHome({
      creatorTermsRequired: true,
      creatorWalkthrough: true,
    })

    expect(
      screen.getByRole('region', {
        name: 'Creator Terms',
      })
    ).toBeInTheDocument()

    expect(
      screen.getByRole('heading', {
        name: 'Creator walkthrough',
      })
    ).toBeInTheDocument()

    expect(
      screen.getByRole('heading', {
        name: 'How fees work',
      })
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/terms/accept',
        expect.objectContaining({
          cache: 'no-store',
        })
      )
    })
  })
})

describe('dashboard flag propagation', () => {
  it('passes false when both server flags are unset', () => {
    vi.stubEnv(
      'CREATOR_WALKTHROUGH_ENABLED',
      undefined
    )

    vi.stubEnv(
      'CREATOR_TERMS_ACCEPTANCE_ENABLED',
      undefined
    )

    const element = DashboardHome()

    expect(element.type).toBe(DashboardPage)

    expect(element.props.creatorWalkthrough).toBe(
      false
    )

    expect(element.props.creatorTermsRequired).toBe(
      false
    )
  })

  it('passes creatorWalkthrough true only for the exact string true', () => {
    vi.stubEnv(
      'CREATOR_WALKTHROUGH_ENABLED',
      'true'
    )

    vi.stubEnv(
      'CREATOR_TERMS_ACCEPTANCE_ENABLED',
      'false'
    )

    const enabled = DashboardHome()

    expect(enabled.props.creatorWalkthrough).toBe(
      true
    )

    expect(enabled.props.creatorTermsRequired).toBe(
      false
    )

    vi.stubEnv(
      'CREATOR_WALKTHROUGH_ENABLED',
      'TRUE'
    )

    const disabled = DashboardHome()

    expect(disabled.props.creatorWalkthrough).toBe(
      false
    )

    expect(disabled.props.creatorTermsRequired).toBe(
      false
    )
  })

  it('preserves the independent creator Terms acceptance flag', () => {
    vi.stubEnv(
      'CREATOR_WALKTHROUGH_ENABLED',
      'false'
    )

    vi.stubEnv(
      'CREATOR_TERMS_ACCEPTANCE_ENABLED',
      'true'
    )

    const termsOnly = DashboardHome()

    expect(termsOnly.props.creatorWalkthrough).toBe(
      false
    )

    expect(termsOnly.props.creatorTermsRequired).toBe(
      true
    )

    vi.stubEnv(
      'CREATOR_WALKTHROUGH_ENABLED',
      'true'
    )

    const bothEnabled = DashboardHome()

    expect(bothEnabled.props.creatorWalkthrough).toBe(
      true
    )

    expect(bothEnabled.props.creatorTermsRequired).toBe(
      true
    )
  })

  it('does not depend on TERMS_CHECKBOX_ENABLED', () => {
    vi.stubEnv(
      'CREATOR_WALKTHROUGH_ENABLED',
      'true'
    )

    vi.stubEnv(
      'CREATOR_TERMS_ACCEPTANCE_ENABLED',
      'false'
    )

    vi.stubEnv(
      'TERMS_CHECKBOX_ENABLED',
      'false'
    )

    const first = DashboardHome()

    expect(first.props.creatorWalkthrough).toBe(
      true
    )

    expect(first.props.creatorTermsRequired).toBe(
      false
    )

    vi.stubEnv(
      'TERMS_CHECKBOX_ENABLED',
      'true'
    )

    const second = DashboardHome()

    expect(second.props.creatorWalkthrough).toBe(
      true
    )

    expect(second.props.creatorTermsRequired).toBe(
      false
    )
  })

  it('defaults both client props to false', () => {
    const element = DashboardPage({})

    expect(element.type).toBe(Dashboard)

    expect(element.props).toEqual({
      creatorTermsRequired: false,
      creatorWalkthrough: false,
    })
  })

  it('forwards both client props without changing their values', () => {
    const element = DashboardPage({
      creatorTermsRequired: true,
      creatorWalkthrough: true,
    })

    expect(element.type).toBe(Dashboard)

    expect(element.props).toEqual({
      creatorTermsRequired: true,
      creatorWalkthrough: true,
    })
  })
})
