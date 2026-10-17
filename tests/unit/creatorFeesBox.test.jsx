import {
  describe,
  it,
  expect,
  afterEach,
} from 'vitest'
import {
  render,
  screen,
  cleanup,
} from '@testing-library/react'
import CreatorFeesBox from '@/components/DashboardComponents/CreatorFeesBox'
import {
  CREATOR_FEES_COPY,
  CREATOR_FEE_POINTS,
} from '@/content/creator/fees'
import {
  CREATOR_TERMS_HTML,
} from '@/content/legal/creatorTermsV1'

const EXPECTED_INTRO =
  "Fix It Today takes 15% of the item price, not shipping. Refunds reverse it pro rata. You pay Stripe's refund and dispute costs."

const EXPECTED_POINTS = [
  {
    id: 'fee_rate',
    clause: '5.1',
    text: 'Fix It Today charges a flat marketplace fee of 15% of the item price for each creator sub-order.',
  },
  {
    id: 'item_price_only',
    clause: '5.2',
    text: 'The fee applies to the item price only. It does not apply to shipping charges.',
  },
  {
    id: 'discounts',
    clause: '5.3',
    text: 'Where you give a buyer a discount, the fee is calculated on the item subtotal after your discount has been applied.',
  },
  {
    id: 'rounding',
    clause: '5.4',
    text: "The fee is calculated once for each creator's sub-order. The calculated amount is rounded half up to the nearest Singapore cent.",
  },
  {
    id: 'processing_at_cost',
    clause: '6.2',
    text: 'Fix It Today passes the applicable payment processing fees to you at cost. These fees are separate from the 15% Fix It Today fee.',
  },
  {
    id: 'full_refund',
    clause: '8.2',
    text: 'For a full refund of the item price, the 15% Fix It Today fee originally charged on that sub-order is reversed in full.',
  },
  {
    id: 'partial_refund',
    clause: '8.3',
    text: 'For a partial refund of the item price, the fee is reversed in proportion to the refunded item value.',
  },
  {
    id: 'shipping_refund',
    clause: '8.5',
    text: 'Refunding shipping charges does not change the Fix It Today fee. The fee is based on the item price only.',
  },
  {
    id: 'refund_dispute_costs',
    clause: '8.10',
    text: 'You are responsible for all refund and dispute costs on your creator orders, whatever the cause.',
  },
  {
    id: 'processing_kept',
    clause: '8.11',
    text: 'When a payment is refunded, you bear the processing fee Stripe keeps on the refund.',
  },
  {
    id: 'dispute_fees',
    clause: '8.17',
    items: [
      {
        label: 'Dispute fee',
        text: 'The amount Stripe actually keeps, by default S$15 per dispute',
      },
      {
        label: 'Challenge fee, only if the dispute is challenged',
        text: 'The amount Stripe actually keeps, by default S$15',
      },
    ],
  },
  {
    id: 'payout_floor',
    clause: '7.11',
    text: 'A payout never goes below zero.',
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

afterEach(() => {
  cleanup()
})

describe('creator fees copy', () => {
  it('matches the approved introduction and all required clauses', () => {
    expect(CREATOR_FEES_COPY).toEqual({
      title: 'How fees work',
      intro: EXPECTED_INTRO,
      contactEmail: 'fixittoday.contact@gmail.com',
      link: {
        label: 'See an example',
        href: '/creator-terms',
      },
    })

    expect(CREATOR_FEE_POINTS).toEqual(EXPECTED_POINTS)
  })
})

describe('CreatorFeesBox', () => {
  it('renders the heading, approved introduction and contact link', () => {
    render(<CreatorFeesBox />)

    expect(
      screen.getByRole('heading', {
        name: 'How fees work',
      })
    ).toBeInTheDocument()

    expect(
      screen.getByText(EXPECTED_INTRO)
    ).toBeInTheDocument()

    expect(
      screen.getByRole('link', {
        name: 'fixittoday.contact@gmail.com',
      })
    ).toHaveAttribute(
      'href',
      'mailto:fixittoday.contact@gmail.com'
    )

    expect(
      screen.getByText(/Questions:/)
    ).toBeInTheDocument()
  })

  it('renders every fee point in the specified order with its clause', () => {
    render(<CreatorFeesBox />)

    const list = screen.getByRole('list', {
      name: 'Creator fees',
    })

    const rows = Array.from(list.children)

    expect(rows).toHaveLength(EXPECTED_POINTS.length)

    for (
      let index = 0;
      index < EXPECTED_POINTS.length;
      index += 1
    ) {
      const point = EXPECTED_POINTS[index]
      const row = rows[index]

      expect(row).toHaveTextContent(
        `(clause ${point.clause})`
      )

      if (point.text) {
        expect(row).toHaveTextContent(point.text)

        expect(
          screen.getByText(point.text)
        ).toBeInTheDocument()
      }

      if (point.items) {
        const nestedList = row.querySelector('ul')

        expect(nestedList).not.toBeNull()

        const nestedRows = Array.from(
          nestedList.children
        )

        expect(nestedRows).toHaveLength(
          point.items.length
        )

        for (
          let itemIndex = 0;
          itemIndex < point.items.length;
          itemIndex += 1
        ) {
          const item = point.items[itemIndex]
          const nestedRow = nestedRows[itemIndex]

          expect(nestedRow).toHaveTextContent(
            `${item.label}:`
          )

          expect(nestedRow).toHaveTextContent(
            item.text
          )
        }
      }
    }
  })

  it('guards all fee statements against Creator Terms v1.0 drift', () => {
    const termsText = CREATOR_TERMS_HTML
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')

    for (const point of CREATOR_FEE_POINTS) {
      if (point.text) {
        expect(termsText).toContain(point.text)
      }

      if (point.items) {
        for (const item of point.items) {
          expect(termsText).toContain(item.label)
          expect(termsText).toContain(item.text)
        }
      }
    }
  })

  it('links See an example to the existing Creator Terms page', () => {
    render(<CreatorFeesBox />)

    const link = screen.getByRole('link', {
      name: 'See an example',
    })

    expect(link).toHaveAttribute(
      'href',
      '/creator-terms'
    )

    expect(link).not.toHaveAttribute('target', '_blank')
  })

  it('provides 44 px minimum height on every link', () => {
    render(<CreatorFeesBox />)

    const links = screen.getAllByRole('link')

    expect(links).toHaveLength(2)

    for (const link of links) {
      expect(link).toHaveClass('min-h-11')
    }
  })

  it('contains no placeholders or prohibited abbreviations', () => {
    const { container } = render(
      <CreatorFeesBox />
    )

    const text = container.textContent

    for (const placeholder of PLACEHOLDERS) {
      expect(text).not.toContain(placeholder)
    }

    expect(text).not.toMatch(/\bFIT\b/)
    expect(text).not.toContain('Pte. Ltd.')
    expect(text).not.toContain('UEN')
  })
})
