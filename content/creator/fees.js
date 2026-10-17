
export const CREATOR_FEES_COPY = {
  title: 'How fees work',
  intro: "Fix It Today takes 15% of the item price, not shipping. Refunds reverse it pro rata. You pay Stripe's refund and dispute costs.",
  contactEmail: 'fixittoday.contact@gmail.com',
  link: {
    label: 'See an example',
    href: '/creator-terms',
  },
}

export const CREATOR_FEE_POINTS = [
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

