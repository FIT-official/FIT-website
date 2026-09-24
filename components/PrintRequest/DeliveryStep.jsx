'use client'
import { addressComplete } from '@/lib/customPrint/deliveryOptions'

const money = value => new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(value)
const input = 'mt-1 w-full rounded-md border border-borderColor bg-background px-3 py-2 text-sm disabled:opacity-50'

export const EMPTY_ADDRESS = Object.freeze({ street: '', unitNumber: '', city: '', state: '', postalCode: '', country: '' })

// Same fields and required set as components/Cart/DeliveryAddressPrompt.jsx,
// saved through the same user contact API.
export function AddressForm({ address, onChange, onSave, saving = false, signedIn, disabled = false }) {
  const set = key => event => onChange({ ...address, [key]: event.target.value })
  const complete = addressComplete(address)
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-xs font-medium sm:col-span-2">Street address <span className="text-red-500">*</span>
        <input type="text" name="street" value={address.street} onChange={set('street')} disabled={disabled} className={input} /></label>
      <label className="block text-xs font-medium">Unit
        <input type="text" name="unitNumber" value={address.unitNumber} onChange={set('unitNumber')} disabled={disabled} className={input} /></label>
      <label className="block text-xs font-medium">Postal code <span className="text-red-500">*</span>
        <input type="text" name="postalCode" value={address.postalCode} onChange={set('postalCode')} disabled={disabled} className={input} /></label>
      <label className="block text-xs font-medium">City <span className="text-red-500">*</span>
        <input type="text" name="city" value={address.city} onChange={set('city')} disabled={disabled} className={input} /></label>
      <label className="block text-xs font-medium">State / Province <span className="text-red-500">*</span>
        <input type="text" name="state" value={address.state} onChange={set('state')} disabled={disabled} className={input} /></label>
      <label className="block text-xs font-medium sm:col-span-2">Country <span className="text-red-500">*</span>
        <input type="text" name="country" value={address.country} onChange={set('country')} disabled={disabled} className={input} /></label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        {signedIn ? <button type="button" onClick={onSave} disabled={disabled || saving || !complete}
          className="rounded-md bg-textColor px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-50">{saving ? 'Saving…' : 'Save address'}</button> : null}
        <span className="text-xs text-lightColor">{signedIn ? 'Saved to your account for next time.' : 'Saved to your account when you sign in.'}</span>
      </div>
    </div>
  )
}

export default function DeliveryStep({ options, value, onSelect, savedAddress, editing, onEdit, address, onAddress, onSaveAddress,
  saving = false, signedIn, disabled = false }) {
  const chosen = options.find(option => option.type === value)
  const useSaved = Boolean(savedAddress) && !editing
  return (
    <div className="space-y-4">
      <div className="grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Delivery">
        {options.map(option => {
          const active = option.type === value
          return <label key={option.type} className={`flex cursor-pointer items-start gap-2.5 rounded-md border p-3 ${active ? 'border-textColor ring-1 ring-textColor' : 'border-borderColor hover:border-lightColor'}`}>
            <input type="radio" name="delivery" value={option.type} checked={active} disabled={disabled} onChange={() => onSelect(option.type)} className="mt-1" />
            <span className="min-w-0"><span className="block text-sm font-semibold">{option.displayName} · {option.price > 0 ? money(option.price) : 'Free'}</span>
              {option.description && <span className="block text-xs text-lightColor">{option.description}</span>}</span>
          </label>
        })}
      </div>
      {chosen?.needsAddress ? useSaved ? <div className="flex items-start justify-between gap-3 rounded-md border border-green-700/40 bg-green-50 px-3 py-2.5 text-sm">
        <div className="min-w-0"><p className="font-semibold">Deliver to</p>
          <p>{savedAddress.street}{savedAddress.unitNumber ? ` ${savedAddress.unitNumber}` : ''}, {savedAddress.city} {savedAddress.postalCode}</p>
          <p className="text-xs text-lightColor">{[savedAddress.state, savedAddress.country].filter(Boolean).join(', ')}</p></div>
        <button type="button" onClick={onEdit} disabled={disabled} className="shrink-0 rounded-md border border-borderColor px-3 py-1.5 text-xs font-semibold hover:border-textColor">Change</button>
      </div> : <AddressForm address={address} onChange={onAddress} onSave={onSaveAddress} saving={saving} signedIn={signedIn} disabled={disabled} />
        : <p className="text-xs text-lightColor">No address needed. We’ll email you when it’s ready to collect.</p>}
    </div>
  )
}
