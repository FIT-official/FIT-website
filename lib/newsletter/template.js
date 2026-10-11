// Pure newsletter templates on the fitnew light email base.
// Links are wrapped for click tracking; an open pixel is appended.
import { emailLayout, esc, SITE_URL } from '@/lib/email/template'

export function trackedClickUrl({ baseUrl, campaignId, token, url }) {
  return `${baseUrl}/api/newsletter/click?c=${encodeURIComponent(campaignId)}&s=${encodeURIComponent(token)}&url=${encodeURIComponent(url)}`
}

export function trackedOpenPixelUrl({ baseUrl, campaignId, token }) {
  return `${baseUrl}/api/newsletter/open?c=${encodeURIComponent(campaignId)}&s=${encodeURIComponent(token)}`
}

export function unsubscribeUrl({ baseUrl, token }) {
  return `${baseUrl}/newsletter/unsubscribe/${encodeURIComponent(token)}`
}

export function preferencesUrl({ baseUrl, token }) {
  return `${baseUrl}/newsletter/preferences/${encodeURIComponent(token)}`
}

function articleCard({ post, href }) {
  const img = post.heroImage
    ? `<img src="${esc(post.heroImage.startsWith('http') ? post.heroImage : `${SITE_URL}/api/proxy?key=${encodeURIComponent(post.heroImage)}`)}" alt="${esc(post.title)}" width="536" style="display:block;width:100%;border-radius:8px 8px 0 0;" />`
    : ''
  return `
  <table class="fit-card" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;border:1px solid #e6e6e6;border-radius:8px;background:#fcfcfc;overflow:hidden;">
    <tr><td>${img}</td></tr>
    <tr>
      <td style="padding:14px 16px;">
        <a class="fit-link" href="${esc(href)}" target="_blank" style="font-size:16px;font-weight:700;color:#111111;text-decoration:none;">${esc(post.title)}</a>
        ${post.excerpt ? `<p class="fit-muted" style="margin:6px 0 0 0;font-size:14px;color:#56616f;">${esc(post.excerpt)}</p>` : ''}
        <p style="margin:8px 0 0 0;"><a class="fit-link" href="${esc(href)}" target="_blank" style="font-size:13px;color:#111111;">Read article →</a></p>
      </td>
    </tr>
  </table>`
}

/**
 * Render a campaign email for one subscriber.
 * @returns {{ html: string, text: string }}
 */
export function renderCampaignEmail({ campaign, posts = [], subscriber, baseUrl = SITE_URL }) {
  const token = subscriber.unsubscribeToken
  const campaignId = String(campaign._id || campaign.id)
  const wrap = (url) => trackedClickUrl({ baseUrl, campaignId, token, url })

  const introHtml = campaign.intro
    ? `<p style="margin:0 0 18px 0;">${esc(campaign.intro)}</p>`
    : ''
  const cards = posts
    .map((p) => articleCard({ post: p, href: wrap(`${baseUrl}/blog/${encodeURIComponent(p.slug)}`) }))
    .join('')

  const footerLinks = `
  <p style="margin:24px 0 0 0;font-size:12px;color:#67696b;">
    <a class="fit-link" href="${esc(preferencesUrl({ baseUrl, token }))}" style="color:#67696b;">Email preferences</a>
    &nbsp;·&nbsp;
    <a class="fit-link" href="${esc(unsubscribeUrl({ baseUrl, token }))}" style="color:#67696b;">Unsubscribe</a>
  </p>
  <img src="${esc(trackedOpenPixelUrl({ baseUrl, campaignId, token }))}" width="1" height="1" alt="" style="display:block;" />`

  const html = emailLayout({
    title: campaign.subject,
    footerReason: 'You subscribed to FIT email updates. Manage preferences or unsubscribe using the links above.',
    preheader: campaign.intro || campaign.subject,
    bodyHtml: `
      <h1 class="fit-ink" style="margin:0 0 16px 0;font-size:20px;font-weight:700;color:#111111;">${esc(campaign.subject)}</h1>
      ${introHtml}
      ${cards}
      ${footerLinks}`,
  })

  const text = [
    campaign.subject,
    '',
    campaign.intro || '',
    '',
    ...posts.map((p) => `${p.title}\n${baseUrl}/blog/${encodeURIComponent(p.slug)}`),
    '',
    `Unsubscribe: ${unsubscribeUrl({ baseUrl, token })}`,
  ].join('\n')

  return { html, text }
}

/** Render one welcome-drip step for a subscriber. */
export function renderWelcomeEmail({ step, subscriber, baseUrl = SITE_URL }) {
  const token = subscriber.unsubscribeToken
  const paragraphs = String(step.body || '')
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px 0;">${esc(p)}</p>`)
    .join('')
  const html = emailLayout({
    title: step.subject,
    footerReason: 'You subscribed to FIT email updates. Unsubscribe using the link above.',
    preheader: step.subject,
    bodyHtml: `
      <h1 class="fit-ink" style="margin:0 0 16px 0;font-size:20px;font-weight:700;color:#111111;">${esc(step.subject)}</h1>
      ${paragraphs}
      <p style="margin:24px 0 0 0;font-size:12px;color:#67696b;">
        <a class="fit-link" href="${esc(unsubscribeUrl({ baseUrl, token }))}" style="color:#67696b;">Unsubscribe</a>
      </p>`,
  })
  return { html, text: `${step.subject}\n\n${step.body || ''}\n\nUnsubscribe: ${unsubscribeUrl({ baseUrl, token })}` }
}
