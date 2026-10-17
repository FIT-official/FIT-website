import { FIT_NAME, FIT_URL, FIT_HOST } from '@/lib/site/identity'

// Shared "Fix It Today, www.fixitoday.com" line for request flows and confirmation pages.
// Selectable text + real link (never an image). `address` is optional and stays empty until confirmed.
export default function FitAddressLine({ address, className = 'px-8 pb-10 pt-2 text-xs text-lightColor' }) {
  const extra = typeof address === 'string' ? address.trim() : ''
  return (
    <p className={className} data-fit-address-line="">
      {FIT_NAME}, <a href={FIT_URL} className="underline hover:text-textColor">{FIT_HOST}</a>{extra ? <>, <span>{extra}</span></> : null}
    </p>
  )
}