# FIT email presentation and safe previews

This change shares a table-based, inline-styled FIT layout across custom print, creator, shop order, sale, delivery-change, chat, manual quote, bulk, repair, guided enquiry, paid preparation, business reporting and newsletter emails. Light/dark CSS is progressive enhancement; the inline light layout remains usable when style blocks are removed. HTML and plain text are sent together. Existing authoritative preparation text is retained.

The actual customer name is preserved: `Fix It Today` produces `Hi Fix It Today,`. Reminder copy distinguishes saved uploads, settings, provider review and quoted requests. Paid and unknown states are excluded; configured manual/creator/guided requests are not customer-action reminders. Quote links carry the exact request to the existing authenticated cart flow. Customer request cards have selectable references and a clipboard button; emails use a small footer reference and details link, with no scripting.

## Model image scope

`preparePrintEmail` optionally reads only the saved `models/{request.userId}/...` object from the existing configured S3 bucket. It never follows `s3Url`, a user image URL, external texture or archive component URL. No new credential or permission is needed. The storage read has a four-second abort deadline and a 4 MiB byte cap; absent/invalid/unsupported images fall back to useful text.

The server rasterizes bounded numeric geometry into a 480 x 320 PNG and sends it as a CID attachment. Source filenames/customer information are not embedded in PNG metadata. Rendering bounds: 30,000 triangles, 90,000 vertices, 128 assembly instances, depth 16; 3MF has at most 256 archive entries, 8 MiB declared expansion and 4 MiB per model part, bounded inflate, XML depth/tag limits, no DTD/entities/CDATA, cycles or unsafe paths. Uniform supported 3MF units and archive-local component transforms are accepted. Multi-part build-item extensions, mixed units, STEP, excessive complexity, degenerate geometry and unsupported sources use the text fallback. The preview is illustrative, never a geometry quote, physical colour guarantee or printability check. Product-source and guided private attachments are not read by this helper.

Generated thumbnails are used by the existing customer/creator custom-print lifecycle email paths and the manual-quote/idle-reminder paths. The durable owner business outbox remains metadata/preparation text plus styled HTML; it does not store model images. Each image attempt is best-effort and does not block the email on parser/storage rejection. Production S3 access and native email-client CID rendering still require authorized deployment smoke.

## Information integrity

- Known material/colour/quantity is shown; unconfigured schema defaults are not presented as customer choices.
- Available delivery options are distinct from the selected fulfilment method. No rate, stock, tax, appointment or delivery promise is invented.
- Broad summaries omit full addresses and chat contents. The individual paid preparation email retains its exact customer/contact/address and line remarks before payment information.
- Customer order confirmation uses the committed checkout snapshot. Creator payments remain direct with the creator.
- Existing newsletter consent, unsubscribe/preferences and tracking behavior are unchanged; previews block all external requests.

## Verification and release

See the external evidence folder for immutable before/after HTML, plaintext, screenshots, test/build/lint receipts, synthetic geometry fixtures and delivery receipts. Browser checks simulate narrow/desktop, dark, blocked images and removed CSS; they are not certification in native Gmail or Outlook. SMTP/Telegram acceptance does not establish inbox placement or reading. Existing legacy customer courtesy emails/nudge scheduling remain best-effort and do not inherit the new owner outbox retry guarantees.

Review/deploy the email change together with its business-notification base, but activate business notifications only after release-owner configuration approval. This source change itself does not deploy, enable the scheduled job, send customer messages, seed orders or modify prices.
