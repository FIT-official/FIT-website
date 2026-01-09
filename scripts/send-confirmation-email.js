// Usage: node scripts/send-confirmation-email.js <sessionId>
import mongoose from 'mongoose';
import CheckoutSession from '../models/CheckoutSession.js';
import User from '../models/User.js';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const sessionId = process.argv[2];
if (!sessionId) {
  console.error('Usage: node scripts/send-confirmation-email.js <sessionId>');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASSWORD,
  },
});

function renderOrderDetails(session, user) {
  // Calculate totals
  let subtotal = 0;
  let shipping = 0;
  let taxes = 0;

  // Collect all items
  const items = [];
  for (const creator of Array.from(session.salesData.values())) {
    if (Array.isArray(creator.items)) {
      for (const item of creator.items) {
        subtotal += (item.unitPrice || 0) * (item.quantity || 0);
        shipping += item.deliveryFee || 0;
        items.push(item);
      }
    }
  }
  const total = subtotal + shipping + taxes;

  // Customer info
  const address = user?.contact?.address || {};
  const name = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || '';

  const addressHtml = `
    <div style="margin-bottom:20px;">
      <h3 style="color:#222;font-size:16px;margin:0 0 8px 0;font-weight:600;">Shipping Information</h3>
      <div style="background:#f9f9f9;border-radius:10px;padding:12px;">
        <div style="color:#444;font-size:14px;line-height:1.4;">
          ${name ? `<div style="font-weight:600;margin-bottom:6px;">${name}</div>` : ''}
          ${address.street || ''} ${address.unitNumber || ''}<br/>
          ${address.city || ''}${address.city ? ', ' : ''}${address.state || ''} ${address.postalCode || ''}<br/>
          ${address.country || ''}
        </div>
      </div>
    </div>
  `;

  // Items grid (matches screenshot layout)
  const itemsHtml = items.map(item => {
    const title = item.productName || item.productId;
    const variants = Array.isArray(item.variantInfo) && item.variantInfo.length ? item.variantInfo.join(', ') : '';
    const qty = item.quantity || 1;
    const price = (item.unitPrice || 0);
    const priceText = `S$${(price * qty).toFixed(2)}`;

    return `
      <div style="display:grid;grid-template-columns:56px 1fr auto;gap:12px;align-items:center;padding:14px 0;border-bottom:1px solid #f0f0f0;">
        <div style="width:56px;height:56px;border-radius:8px;background:#fff;border:1px solid #eee;flex:0 0 56px;"></div>
        <div>
          <div style="font-size:16px;color:#222;font-weight:600;margin-bottom:6px;">${title} × ${qty}</div>
          <div style="font-size:13px;color:#888;">${variants}</div>
        </div>
        <div style="font-size:16px;color:#444;font-weight:600;text-align:right;">${priceText}</div>
      </div>
    `;
  }).join('');

  // Totals grid (right aligned numeric column)
  const totalsHtml = `
    <div style="padding-top:18px;">
      <div style="display:grid;grid-template-columns:1fr auto;row-gap:8px;color:#888;font-size:14px;">
        <div>Subtotal</div><div style="text-align:right;color:#444;">S$${subtotal.toFixed(2)}</div>
        <div>Shipping</div><div style="text-align:right;color:#444;">S$${shipping.toFixed(2)}</div>
        <div>Taxes</div><div style="text-align:right;color:#444;">S$${taxes.toFixed(2)}</div>
      </div>
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0;" />
      <div style="display:grid;grid-template-columns:1fr auto;align-items:center;font-size:20px;font-weight:700;color:#222;">
        <div>Total</div><div style="text-align:right;">S$${total.toFixed(2)}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr auto;align-items:center;font-size:14px;color:#888;margin-top:10px;">
        <div>Total paid today</div><div style="text-align:right;">S$${total.toFixed(2)}</div>
      </div>
    </div>
  `;

  const html = `
    <div style="background:#fff;color:#222;font-family:Inter,Arial,sans-serif;font-size:15px;max-width:700px;margin:auto;padding:28px;border-radius:12px;border:1px solid #eee;">
      <h2 style="font-size:22px;font-weight:700;margin:0 0 12px 0;color:#222;">Order summary</h2>

      ${addressHtml}

      <div style="margin-top:8px;border-radius:10px;padding:12px;background:#fff;">
        ${itemsHtml}
        ${totalsHtml}
      </div>

      <div style="margin-top:22px;text-align:center;">
        <a href="https://www.fixitoday.com/account" style="display:inline-block;padding:12px 28px;background:#000;color:#fff;font-weight:700;border-radius:8px;text-decoration:none;font-size:15px;">Go to Account</a>
      </div>
    </div>
  `;
  return html;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  // Fetch session from DB
  const session = await CheckoutSession.findOne({ sessionId });
  if (!session) {
    console.error('Session not found');
    process.exit(1);
  }

  // Fetch user from DB using userId from session
  const user = await User.findOne({ userId: session.userId });
  if (!user) {
    console.error('User not found for userId:', session.userId);
    process.exit(1);
  }

  // Build salesData and digitalProductData
  const salesData = {};
  const digitalProductData = {};

  let foundAny = false;

  for (const order of user.orderHistory) {
    if (order.stripeSessionId !== sessionId) continue;
    foundAny = true;
    const item = order.cartItem;
    // Fetch product details
    const productRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/product?productId=${item.productId}`);
    const { product } = await productRes.json();

    // --- FIX VARIANT INFO ---
    let variantInfo = [];
    if (item.selectedVariants) {
      let variantsObj = item.selectedVariants;
      if (typeof variantsObj.entries === 'function') {
        variantsObj = Object.fromEntries(variantsObj.entries());
      }
      variantInfo = Object.entries(variantsObj).map(([option, value]) => `${option}: ${value}`);
    }

    // Add to digitalProductData if product has paid assets
    if (product.paidAssets && product.paidAssets.length > 0) {
      digitalProductData[item.productId] = {
        buyer: user.userId,
        links: Array.isArray(product.paidAssets) ? product.paidAssets : [],
      };
    }
    // Build salesData
    const creatorId = product.creatorUserId || 'default';
    if (!salesData[creatorId]) {
      salesData[creatorId] = {
        totalAmount: 0,
        productRevenue: 0,
        shippingRevenue: 0,
        items: []
      };
    }
    // Calculate deliveryFee if not present
    let deliveryFee = item.deliveryFee || 0;
    if (!deliveryFee && product.delivery && Array.isArray(product.delivery.deliveryTypes)) {
      const foundType = product.delivery.deliveryTypes.find(dt => dt.type === item.chosenDeliveryType);
      if (foundType) deliveryFee = foundType.price || foundType.customPrice || 0;
    }
    salesData[creatorId].items.push({
      productId: item.productId,
      productName: product.name || item.productId,
      variantInfo,
      quantity: item.quantity,
      unitPrice: item.price,
      deliveryFee,
      deliveryType: item.chosenDeliveryType
    });
  }

  if (!foundAny) {
    console.warn('No orderHistory items found for this sessionId.');
  }

  // Compose a session-like object for renderOrderDetails
  const sessionForEmail = {
    salesData: new Map(Object.entries(salesData)),
    digitalProductData: new Map(Object.entries(digitalProductData)),
  };
  const userEmail = user.email || 'sabaazad.fathima@giis.edu.sg';
  const html = renderOrderDetails(sessionForEmail, user);
  await transporter.sendMail({
    from: `FixItToday <${process.env.GMAIL_USER}>`,
    to: userEmail,
    subject: 'Your FIT Order Confirmation',
    html,
  });
  console.log('Confirmation email sent to', userEmail);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
