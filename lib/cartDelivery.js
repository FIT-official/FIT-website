import { lineNeedsDeliveryAddress } from './checkoutAddressGate'
import { paidShopDeliveryFee } from './shopShipping'
import { resolveDeliveryFee } from './quoting/deliveryTypeResolver'

// Defaults use the product's configured fees, including the existing shop
// fallback. The server alone applies free standard delivery after checking
// the address, complete basket and private costs. Never replace a saved choice.
export function defaultCartDelivery(product, chosenType = '') {
    if (chosenType) return chosenType
    const options = (product?.delivery?.deliveryTypes || []).filter(option => option?.type)
    const delivery = options.filter(option => lineNeedsDeliveryAddress(option.type))
    const candidates = delivery.length ? delivery : options
    const fee = option => {
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
