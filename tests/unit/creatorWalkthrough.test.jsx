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
  fireEvent,
  cleanup,
  waitFor,
} from '@testing-library/react'
import CreatorWalkthrough from '@/components/DashboardComponents/CreatorWalkthrough'
import { WALKTHROUGH_STEPS } from '@/content/creator/walkthrough'

const STORAGE_KEY = 'fit.creatorWalkthrough.v1'

const EXPECTED_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to your shop',
    body: 'Follow this checklist to set up your shop. It takes a few steps, and you can stop and come back any time.',
    action: {
      type: 'next',
      label: 'Get started',
    },
  },
  {
    id: 'stripe',
    title: 'Connect Stripe to get paid',
    body: 'Fix It Today pays you through Stripe Connect or PayNow, as we tell you when you join. For Stripe, fill in your details there.',
    action: {
      type: 'link',
      label: 'Connect Stripe',
      href: '#stripe-payouts',
    },
  },
  {
    id: 'printer',
    title: 'Connect your printer',
    body: "Available once Fix It Today's printer app is released. Until then, print and update the order yourself. The app is designed to keep codes local.",
    action: null,
    options: [
      {
        id: 'bambu',
        title: 'Bambu Lab printers',
        body: 'Once the app is released: it only reads status unless you turn on LAN Only and Developer Mode. Otherwise, press Send in Bambu Connect.',
      },
      {
        id: 'prusa',
        title: 'Prusa printers',
        body: "Once the app is released: turn on PrusaLink in the printer's network settings, then enter its IP address, username and password in the app.",
      },
      {
        id: 'octoprint_klipper',
        title: 'OctoPrint or Klipper',
        body: 'Once the app is released: for OctoPrint, add its address and click Allow. For Klipper, enter your Moonraker address and API key.',
      },
    ],
  },
  {
    id: 'list_item',
    title: 'List your first item',
    body: 'Add photos, your 3D model, print settings, delivery and price. Confirm you have the right to sell the design.',
    action: {
      type: 'link',
      label: 'Create product',
      href: '/dashboard/products/create',
    },
  },
  {
    id: 'fulfil',
    title: 'Fulfil your orders',
    body: "Start fulfilment to see the buyer's delivery details. Print, pack and send, then update the status. Payment status shows separately.",
    action: {
      type: 'link',
      label: 'View orders',
      href: '#orders',
    },
  },
  {
    id: 'payouts',
    title: 'See what you earn',
    body: 'Your share per order, after the 15% fee. Fix It Today pays you through Stripe Connect or PayNow, as we tell you when you join.',
    action: {
      type: 'link',
      label: 'View payouts',
      href: '/dashboard/payouts',
    },
  },
]

const PLACEHOLDERS = [
  '[',
  ']',
  'TODO',
  'TBD',
  'BLANK',
  'lorem',
  'XXX',
  '{{',
  'coming soon',
]

const originalFetch = globalThis.fetch

beforeEach(() => {
  localStorage.clear()
  globalThis.fetch = vi.fn()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
  globalThis.fetch = originalFetch
})

function stepButton(number) {
  return screen.getByRole('button', {
    name: `Step ${number}: ${EXPECTED_STEPS[number - 1].title}`,
  })
}

function expectCurrentStep(number) {
  expect(
    screen.getByText(`Step ${number} of 6`)
  ).toBeInTheDocument()

  expect(
    screen.getByRole('heading', {
      name: EXPECTED_STEPS[number - 1].title,
    })
  ).toBeInTheDocument()

  expect(stepButton(number)).toHaveAttribute(
    'aria-current',
    'step'
  )
}

describe('creator walkthrough copy', () => {
  it('matches the approved six steps and printer options exactly', () => {
    expect(WALKTHROUGH_STEPS).toEqual(EXPECTED_STEPS)

    expect(WALKTHROUGH_STEPS.map(step => step.id)).toEqual([
      'welcome',
      'stripe',
      'printer',
      'list_item',
      'fulfil',
      'payouts',
    ])

    expect(
      WALKTHROUGH_STEPS[2].options.map(option => option.id)
    ).toEqual([
      'bambu',
      'prusa',
      'octoprint_klipper',
    ])
  })

  it('does not contain unauthorised printer actions', () => {
    const printer = WALKTHROUGH_STEPS[2]

    expect(printer.action).toBeNull()

    for (const option of printer.options) {
      expect(option).not.toHaveProperty('action')
    }
  })
})

describe('CreatorWalkthrough', () => {
  it('renders the first step and disables Back', () => {
    render(<CreatorWalkthrough />)

    expect(
      screen.getByRole('heading', {
        name: 'Creator walkthrough',
      })
    ).toBeInTheDocument()

    expectCurrentStep(1)

    expect(
      screen.getByRole('button', { name: 'Back' })
    ).toBeDisabled()

    expect(
      screen.getByRole('button', { name: 'Next' })
    ).toBeEnabled()

    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('navigates through all six steps with Next, Back and dots without fetching', () => {
    render(<CreatorWalkthrough />)

    for (let number = 2; number <= 6; number += 1) {
      fireEvent.click(
        screen.getByRole('button', { name: 'Next' })
      )

      expectCurrentStep(number)
    }

    expect(
      screen.getByRole('button', { name: 'Next' })
    ).toBeDisabled()

    for (let number = 5; number >= 1; number -= 1) {
      fireEvent.click(
        screen.getByRole('button', { name: 'Back' })
      )

      expectCurrentStep(number)
    }

    expect(
      screen.getByRole('button', { name: 'Back' })
    ).toBeDisabled()

    for (let number = 1; number <= 6; number += 1) {
      fireEvent.click(stepButton(number))

      expectCurrentStep(number)
    }

    for (let number = 1; number <= 6; number += 1) {
      if (number !== 6) {
        expect(stepButton(number)).not.toHaveAttribute(
          'aria-current'
        )
      }
    }

    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('moves to step two when Get started is clicked', () => {
    render(<CreatorWalkthrough />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Get started',
      })
    )

    expectCurrentStep(2)

    expect(
      screen.getByRole('link', {
        name: 'Connect Stripe',
      })
    ).toHaveAttribute('href', '#stripe-payouts')

    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it.each([
    [2, 'Connect Stripe', '#stripe-payouts'],
    [4, 'Create product', '/dashboard/products/create'],
    [5, 'View orders', '#orders'],
    [6, 'View payouts', '/dashboard/payouts'],
  ])(
    'renders the exact action and destination for step %i',
    (number, label, href) => {
      render(<CreatorWalkthrough />)

      fireEvent.click(stepButton(number))

      const link = screen.getByRole('link', {
        name: label,
      })

      expect(link).toHaveAttribute('href', href)

      expect(link).toHaveClass('min-h-11')

      expect(globalThis.fetch).not.toHaveBeenCalled()
    }
  )

  it('renders all printer options and no printer pairing controls', () => {
    render(<CreatorWalkthrough />)

    fireEvent.click(stepButton(3))

    expectCurrentStep(3)

    for (const option of EXPECTED_STEPS[2].options) {
      expect(
        screen.getByRole('heading', {
          name: option.title,
        })
      ).toBeInTheDocument()

      expect(
        screen.getByText(option.body)
      ).toBeInTheDocument()
    }

    const forbiddenLabels = [
      'Pair a printer',
      'Add Bambu printer',
      'Add Prusa printer',
      'Add printer',
    ]

    for (const label of forbiddenLabels) {
      expect(
        screen.queryByRole('button', { name: label })
      ).not.toBeInTheDocument()

      expect(
        screen.queryByRole('link', { name: label })
      ).not.toBeInTheDocument()
    }

    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('persists step and dismissal, restores them after remount, and supports Show guide', async () => {
    const firstMount = render(<CreatorWalkthrough />)

    fireEvent.click(stepButton(3))

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Hide guide',
      })
    )

    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY))
    ).toEqual({
      dismissed: true,
      step: 3,
    })

    expect(
      screen.getByRole('heading', {
        name: 'Creator walkthrough',
      })
    ).toBeInTheDocument()

    expect(
      screen.queryByText('Step 3 of 6')
    ).not.toBeInTheDocument()

    expect(
      screen.getByRole('button', {
        name: 'Show guide',
      })
    ).toHaveAttribute('aria-expanded', 'false')

    firstMount.unmount()

    render(<CreatorWalkthrough />)

    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: 'Show guide',
        })
      ).toBeInTheDocument()
    })

    expect(
      screen.queryByText('Step 3 of 6')
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Show guide',
      })
    )

    expectCurrentStep(3)

    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY))
    ).toEqual({
      dismissed: false,
      step: 3,
    })

    expect(
      screen.getByRole('button', {
        name: 'Hide guide',
      })
    ).toHaveAttribute('aria-expanded', 'true')
  })

  it.each([
    'not-valid-json',
    JSON.stringify({
      dismissed: false,
      step: 0,
    }),
    JSON.stringify({
      dismissed: false,
      step: 7,
    }),
    JSON.stringify({
      dismissed: true,
      step: -1,
    }),
    JSON.stringify({
      dismissed: false,
      step: 1.5,
    }),
    JSON.stringify({
      dismissed: 'true',
      step: 2,
    }),
    JSON.stringify({
      dismissed: true,
      step: '3',
    }),
    JSON.stringify(null),
    JSON.stringify([]),
  ])(
    'falls back to step one for invalid stored state',
    stored => {
      localStorage.setItem(STORAGE_KEY, stored)

      render(<CreatorWalkthrough />)

      expectCurrentStep(1)

      expect(
        screen.getByRole('button', {
          name: 'Hide guide',
        })
      ).toBeInTheDocument()
    }
  )

  it('does not crash if localStorage.getItem throws', () => {
    vi.spyOn(
      Storage.prototype,
      'getItem'
    ).mockImplementation(() => {
      throw new Error('Storage unavailable')
    })

    expect(() => {
      render(<CreatorWalkthrough />)
    }).not.toThrow()

    expectCurrentStep(1)

    fireEvent.click(stepButton(2))

    expectCurrentStep(2)
  })

  it('does not crash if localStorage.setItem throws', () => {
    vi.spyOn(
      Storage.prototype,
      'setItem'
    ).mockImplementation(() => {
      throw new Error('Storage unavailable')
    })

    render(<CreatorWalkthrough />)

    expect(() => {
      fireEvent.click(stepButton(4))
    }).not.toThrow()

    expectCurrentStep(4)

    expect(() => {
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Hide guide',
        })
      )
    }).not.toThrow()

    expect(
      screen.getByRole('button', {
        name: 'Show guide',
      })
    ).toBeInTheDocument()
  })

  it('uses accessible touch targets on all buttons and links', () => {
    render(<CreatorWalkthrough />)

    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveClass('min-h-11')
    }

    for (let number = 1; number <= 6; number += 1) {
      fireEvent.click(stepButton(number))

      for (const button of screen.getAllByRole('button')) {
        expect(button).toHaveClass('min-h-11')
      }

      for (const link of screen.queryAllByRole('link')) {
        expect(link).toHaveClass('min-h-11')
      }
    }

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Hide guide',
      })
    )

    expect(
      screen.getByRole('button', {
        name: 'Show guide',
      })
    ).toHaveClass('min-h-11')
  })

  it('renders every approved body without placeholders or prohibited abbreviations', () => {
    render(<CreatorWalkthrough />)

    for (let number = 1; number <= 6; number += 1) {
      fireEvent.click(stepButton(number))

      const expected = EXPECTED_STEPS[number - 1]

      expect(
        screen.getByText(expected.body)
      ).toBeInTheDocument()

      const text = document.body.textContent

      for (const placeholder of PLACEHOLDERS) {
        expect(text).not.toContain(placeholder)
      }

      expect(text).not.toMatch(/\bFIT\b/)
      expect(text).not.toContain('Pte. Ltd.')
      expect(text).not.toContain('UEN')
    }

    fireEvent.click(stepButton(3))

    for (const option of EXPECTED_STEPS[2].options) {
      expect(
        screen.getByText(option.body)
      ).toBeInTheDocument()
    }

    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
