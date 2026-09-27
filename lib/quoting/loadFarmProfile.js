/**
 * Server-side loaders for print-farm pricing. The resolved profile is always
 * built here from the creator's SAVED service and Fix It Today's saved
 * settings; nothing a client sends is used as a rate.
 */
import { connectToDatabase } from '@/lib/db'
import AppSettings from '@/models/AppSettings'
import Product from '@/models/Product'
import CreatorPrintService from '@/models/CreatorPrintService'
import { getAppSettingsId } from '@/lib/appSettingsId'
import { buildDeliveryOptions } from '@/lib/customPrint/deliveryOptions'
import { resolveFarmPricing } from './farmProfile'

/**
 * Fix It Today's recommended pricing inputs: AppSettings and the custom-print
 * delivery options customers see on the request page.
 * @param {{appSettings?: object}} [opts] - reuse an AppSettings doc already read
 */
export async function loadRecommendedPricing({ appSettings } = {}) {
    await connectToDatabase()
    const [settings, product] = await Promise.all([
        appSettings ? Promise.resolve(appSettings) : AppSettings.findById(getAppSettingsId()).lean(),
        Product.findOne({ slug: 'custom-print-request' }).select('delivery').lean(),
    ])
    return {
        appSettings: settings || {},
        recommendedDelivery: buildDeliveryOptions(product?.delivery?.deliveryTypes || [], settings?.additionalDeliveryTypes || []),
    }
}

/**
 * @returns {Promise<{service: object|null, profile: object|null, recommended?: object}>}
 */
export async function loadFarmProfile(creatorUserId, { appSettings, service: knownService } = {}) {
    if (typeof creatorUserId !== 'string' || !creatorUserId) return { service: null, profile: null }
    await connectToDatabase()
    const service = knownService || await CreatorPrintService.findOne({ creatorUserId }).lean()
    if (!service) return { service: null, profile: null }
    const recommended = await loadRecommendedPricing({ appSettings })
    return {
        service,
        recommended,
        profile: resolveFarmPricing({ recommended: recommended.appSettings, service, recommendedDelivery: recommended.recommendedDelivery }),
    }
}
