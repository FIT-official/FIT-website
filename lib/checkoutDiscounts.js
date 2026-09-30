import Event from '@/models/Event'

export async function checkoutDiscountRules() {
    const now = new Date()
    const events = await Event.find({
        isActive: true, isGlobal: true, startDate: { $lte: now }, endDate: { $gte: now },
    }).lean()
    return (events || []).map(event => ({
        percentage: event.percentage, minimumAmount: event.minimumPrice,
        startDate: event.startDate, endDate: event.endDate,
    }))
}
