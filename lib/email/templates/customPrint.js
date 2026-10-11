import {emailLayout,emailResult,bodyBlock,breakdownTable,infoTable,ctaButton,esc,money,SITE_URL} from '@/lib/email/template'
import {customerName,modelName,printSummary,requestDetailsUrl,requestEditorUrl} from '@/lib/email/printDetails'
const cartUrl=request=>request?.requestId?`${SITE_URL}/cart?addCustomRequest=${encodeURIComponent(request.requestId)}`:requestDetailsUrl(request)
const greeting=request=>`Hi ${esc(customerName(request))},`
function linesFrom(b={}) {
  const lines=Array.isArray(b.lines)&&b.lines.length?b.lines.map(l=>({label:l.label,amount:l.amount})):(b.amount!=null?[{label:'Print',amount:b.amount,always:true}]:[])
  if(Number(b.deliveryFee)>0)lines.push({label:'Delivery',amount:b.deliveryFee})
  return lines
}
function render({request,preview,breakdown,heading,paragraphs,subject=heading,preheader=heading,extra='',cta,audience='customer'}) {
  const detailsUrl=audience==='customer'?requestDetailsUrl(request):`${SITE_URL}/admin`
  return emailResult(subject,emailLayout({title:heading,preheader,reference:request?.requestId,detailsUrl,
    bodyHtml:bodyBlock({heading,paragraphs})+printSummary(request,{preview,breakdown})+extra+(cta?ctaButton(cta):'')}))
}
export function buildAwaitingQuoteEmail({request,preview}={}) {
  return render({request,preview,heading:'Your request is awaiting a quote',subject:"We're preparing your custom-print quote",paragraphs:[greeting(request),'We received your print settings. Our team will review the model and prepare a quote. Printing has not started.',"We'll email you when there is a quote to review."],cta:{href:requestDetailsUrl(request),label:'View my request'}})
}
export function buildQuoteReadyEmail({request,breakdown,preview}={}) {
  const total=breakdown?.total??breakdown?.amount,currency=breakdown?.currency||request?.currency||'sgd'
  const known=total!=null&&Number.isFinite(Number(total))&&Number(total)>=0
  return render({request,breakdown,preview,heading:'Your print quote is ready',subject:`Your custom-print quote is ready${known?' - '+money(total,currency):''}`,
    paragraphs:[greeting(request),'Review your quote and the saved print details below. Printing has not started; payment must be confirmed before your job can be scheduled.'],
    extra:known?breakdownTable({lines:linesFrom(breakdown),total,currency}):'<p>Open your request to check the recorded quote before paying.</p>',
    cta:{href:known?cartUrl(request):requestDetailsUrl(request),label:known?'Review & pay':'View my request'}})
}
export function buildPaymentReceivedEmail({request,breakdown,preview}={}) {
  const total=breakdown?.total??breakdown?.amount,currency=breakdown?.currency||request?.currency||'sgd'
  return render({request,breakdown,preview,heading:'Payment received. Thank you!',subject:'Payment received for your custom print',
    paragraphs:[greeting(request),'Your payment is recorded and your print is queued. We will send an update when printing starts, and confirm the next step for your selected delivery or collection arrangement.'],
    extra:total!=null?breakdownTable({lines:linesFrom(breakdown),total,currency,totalLabel:'Paid'}):'',cta:{href:requestDetailsUrl(request),label:'View my print request'}})
}
const STATUS_COPY={
  printing:{heading:'Your print has started',line:'Your model is now on the printer.'},
  printed:{heading:'Your print is complete',line:'Printing is complete. We will confirm when your order is ready for its selected delivery or collection arrangement.'},
  shipped:{heading:'Your order is on its way',line:'Your print has shipped. Any recorded tracking details appear below.'},
  delivered:{heading:'Your print is marked delivered',line:'Your print has been marked delivered. If it has not reached you, please contact FIT.'},
}
export function buildStatusUpdateEmail({request,status,preview}={}) {
  const copy=STATUS_COPY[status]||{heading:'Update on your custom print',line:`Your recorded request status is ${status||request?.status||'being reviewed'}.`}
  const rows=[['Recorded status',status||request?.status]]
  if(status==='shipped'){
    rows.push(['Tracking number',request?.trackingNumber])
    const date=request?.estimatedDelivery?new Date(request.estimatedDelivery):null
    if(date&&Number.isFinite(+date))rows.push(['Estimated delivery',date.toLocaleDateString('en-SG',{timeZone:'Asia/Singapore',year:'numeric',month:'short',day:'numeric'})])
  }
  return render({request,preview,heading:copy.heading,paragraphs:[greeting(request),esc(copy.line)],extra:infoTable(rows),cta:{href:requestDetailsUrl(request),label:'View my print request'}})
}
export function buildCancelledEmail({request,note,preview}={}) {
  return render({request,preview,heading:'Your print request was cancelled',subject:'Your custom-print request was cancelled',paragraphs:[greeting(request),'Your custom-print request has been cancelled.',note?`Note: ${esc(note)}`:'','If you have a question about this change, reply to this email.'],cta:{href:requestDetailsUrl(request),label:'View request details'}})
}
export function buildIdleNudgeEmail({request,preview}={}) {
  if(!request||request.paidAt||!['pending_config','configured','quoted'].includes(request.status))return null
  const creator=Boolean(request.creatorUserId),review=request.status==='configured'&&(request.quoteMode==='manual'||creator||request.guidedBrief)
  const state=request.status==='pending_config'?{heading:'Your uploaded model is saved',line:'Your model is uploaded, but the print settings are not complete. You can return to choose the settings when you are ready. No print has started.',label:'Configure my print',href:requestEditorUrl(request)}:
    review?{heading:'Your request is awaiting review',line:'Your saved print details are awaiting a quote. Printing has not started. We will notify you when a quote is ready to review.',label:'View my request',href:requestDetailsUrl(request)}:
    request.status==='configured'?{heading:'Your print settings are saved',line:'Your print settings are saved. Open the request to review them and continue to a quote. No print has started.',label:'Continue my request',href:requestEditorUrl(request)}:
    creator?{heading:'Your creator quote is ready to review',line:'Your creator has provided a quote. Review it and confirm the next steps directly with the creator; payment is arranged with them.',label:'View my print request',href:requestDetailsUrl(request)}:
    {heading:'Your print quote is ready to review',line:'Your saved quote is available to review. Printing has not started; payment must be confirmed before your job can be scheduled. If you have just paid, check your request for the latest status.',label:'Review & pay',href:cartUrl(request)}
  return render({request,preview,heading:state.heading,subject:state.heading,paragraphs:[greeting(request),esc(state.line),'Need help with the model or your options? Reply to this email and we can help.'],cta:{href:state.href,label:state.label}})
}
export function buildNewRequestAdminEmail({request,preview}={}) {
  return render({request,preview,audience:'owner',heading:'New custom-print enquiry',paragraphs:[`A print request was submitted by ${esc(customerName(request))}. Review the saved details before quoting.`],extra:infoTable([['Customer email',request?.userEmail]]),cta:{href:`${SITE_URL}/admin`,label:'Review print request'}})
}
export function buildPaymentReceivedAdminEmail({request,breakdown,preview}={}) {
  const total=breakdown?.total??breakdown?.amount,currency=breakdown?.currency||request?.currency||'sgd'
  return render({request,breakdown,preview,audience:'owner',heading:'Custom-print payment received',paragraphs:[`Payment${total!=null?' of '+esc(money(total,currency)):''} is recorded for ${esc(modelName(request))}. Review the recorded preparation details before scheduling production.`],extra:infoTable([['Customer',request?.userName],['Customer email',request?.userEmail]]),cta:{href:`${SITE_URL}/admin`,label:'Review paid print'}})
}
