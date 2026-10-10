import { lineNeedsDeliveryAddress } from './checkoutAddressGate'
import { paidShopDeliveryFee, usesWeightShipping } from './shopShipping'
import { standardShippingTier } from './shipping/weightTiers'
import { resolveDeliveryFee } from './quoting/deliveryTypeResolver'

// Defaults use computed standard tiers and the other configured fees. The
// server alone applies free standard delivery after checking
// the address, complete basket and private costs. Never replace a saved choice.
export function defaultCartDelivery(product, chosenType = '') {
    if (chosenType) return chosenType
    const standard = usesWeightShipping(product)
        ? standardShippingTier([{ product, quantity: 1 }], Math.round((product.basePrice?.presentmentAmount || 0) * 100)) : null
    const options = (product?.delivery?.deliveryTypes || []).filter(option => option?.type &&
        !(option.type === 'standard-shipping' && standard?.blocked))
    const delivery = options.filter(option => lineNeedsDeliveryAddress(option.type))
    const candidates = delivery.length ? delivery : options
    const fee = option => {
        if (option.type === 'standard-shipping' && standard) return standard.priceCents / 100
        const resolved = resolveDeliveryFee(options, option.type, { key: 'type' })
        const value = paidShopDeliveryFee(product, option.type, resolved.fee)
        return Number.isFinite(value) && value >= 0 ? value : Infinity
    }
    return [...candidates].sort((a, b) => fee(a) - fee(b) ||
        Number(b.type === 'standard-shipping') - Number(a.type === 'standard-shipping'))[0]?.type || 'selfCollect'
}

const labels = {
    'standard-shipping': 'Standard delivery',
    'express-courier': 'Express courier',
    'pick-up': 'Self pick-up',
    pickup: 'Self pick-up',
    pick_up: 'Self pick-up',
    selfCollect: 'Self pick-up',
    digital: 'Digital download',
    printDelivery: 'Print delivery',
}

export function cartDeliveryLabel(type, metadata = {}, option = {}) {
    return metadata[type]?.displayName || option.displayName || labels[type] ||
        (type ? type.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').replace(/^./, c => c.toUpperCase()) : 'Delivery')
}
