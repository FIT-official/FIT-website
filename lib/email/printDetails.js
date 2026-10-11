import { esc, infoTable, SITE_URL } from './template'
export const requestDetailsUrl = request => `${SITE_URL}/account/prints#request-${encodeURIComponent(request?.requestId || '')}`
export const requestEditorUrl = request => `${SITE_URL}/prints/request?requestId=${encodeURIComponent(request?.requestId || '')}`
export const customerName = request => request?.userName || request?.userEmail || 'there'
export const modelName = request => request?.modelFile?.originalName || request?.guidedBrief?.purpose || 'Custom print'
const text = value => typeof value === 'string' && value.trim() ? value.trim() : null
const deliveryName = type => ({'pick-up':'Collection','pickup':'Collection','collection':'Collection','standard-shipping':'Standard shipping','express-shipping':'Express shipping','digital':'Digital delivery'}[type] || type)
export function printDetailRows(request={},breakdown={}) {
  const config=request.printConfiguration||{},generic=config.generic||{},brief=request.guidedBrief||{}
  const settings=config.isConfigured ? config.printSettings||{} : {}
  const colour=brief.colour||generic.colour
  const material=brief.material||generic.filament||generic.material||settings.filamentType||settings.materialType
  const quantity=brief.quantity ?? breakdown.quantity ?? request.quantity
  const selected=breakdown.chosenDeliveryType||request.chosenDeliveryType
  const options=request.delivery?.deliveryTypes||[]
  const choice=options.find(o=>o.type===selected)
  const address=request.shippingAddress||{}
  const rows=[['Model',modelName(request)],['Material',material],['Colour',colour],
    [brief.quantity?'Copies in this batch':'Quantity',Number.isSafeInteger(quantity)&&quantity>0?quantity:null]]
  if(selected){
    rows.push(['Fulfilment',deliveryName(selected)])
    if(['pick-up','pickup','collection'].includes(selected))rows.push(['Collection location',text(choice?.pickupLocation)])
    else if(selected!=='digital')rows.push(['Delivery area',[address.city,address.postalCode,address.country].filter(text).join(', ')])
  } else if(options.length){
    rows.push(['Available options',options.map(o=>deliveryName(o.type)).join(', ')])
    for(const option of options)if(['pick-up','pickup','collection'].includes(option.type)&&text(option.pickupLocation))rows.push(['Collection option',option.pickupLocation])
  }
  return rows
}
export function printSummary(request, {breakdown,preview}={}) {
  // Only a server-generated CID is rendered. User URLs, data URLs, SVGs and
  // arbitrary stored image fields are never accepted by email presentation.
  const cid=preview?.cid
  const image=/^fit-model-[a-f0-9]{64}@fixitoday\.com$/.test(cid||'') ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 10px"><tr><td align="center" bgcolor="#eef1f4" style="background:#eef1f4;padding:12px;border-radius:8px"><img src="cid:${esc(cid)}" width="320" height="213" alt="Generated model preview; model name and specifications follow below" style="display:block;width:100%;max-width:320px;height:auto;border:0"></td></tr></table><p class="fit-muted" style="font-size:12px;color:#56616f;margin:0 0 14px">Model shape preview. Screen colour is approximate; this is not a printability assessment.</p>` : ''
  return image+infoTable(printDetailRows(request,breakdown))
}
