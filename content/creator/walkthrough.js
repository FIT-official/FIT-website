
export const WALKTHROUGH_STEPS = [
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

