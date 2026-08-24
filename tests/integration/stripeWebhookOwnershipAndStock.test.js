// Integration-style tests for the Stripe webhook's checkout.session.completed
// fulfilment: custom-print payment ownership scoping, idempotent re-fulfilment
// guard, and atomic stock decrement. Convention: mock Stripe/Clerk/Mongoose at
// the edges, matching tests/integration/stripeWebhookIdempotency.test.js.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { constructEvent, paymentIntentsRetrieve } = vi.hoisted(() => ({
    constructEvent: vi.fn(),
    paymentIntentsRetrieve: vi.fn(),
}))

vi.mock('stripe', () => ({
    default: class Stripe {
        constructor() {
            this.webhooks = { constructEvent }
            this.paymentIntents = { retrieve: paymentIntentsRetrieve }
        }
    },
}))
vi.mock('@/lib/db', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/models/User', () => ({ default: { findOne: vi.fn() } }))
vi.mock('@/models/Product', () => ({
    default: { findOne: vi.fn(), findById: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() },
}))
vi.mock('@/models/CheckoutSession', () => ({
    default: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() },
}))
vi.mock('@/models/Order', () => ({ default: vi.fn() }))
vi.mock('@/models/CustomPrintRequest', () => ({ default: { findOne: vi.fn(), create: vi.fn() } }))
vi.mock('@/models/AppSettings', () => ({ default: { findById: vi.fn() } }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/notifications/customPrint', () => ({ notifyCustomPrintEvent: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ clerkClient: vi.fn() }))

import { POST } from '@/app/api/webhook/stripe/route'
import CheckoutSession from '@/models/CheckoutSession'
import User from '@/models/User'
import Product from '@/models/Product'
import CustomPrintRequest from '@/models/CustomPrintRequest'
import AppSettings from '@/models/AppSettings'
import Order from '@/models/Order'
import { sendEmail } from '@/lib/email'
import { notifyCustomPrintEvent } from '@/lib/notifications/customPrint'

const fakeRequest = () => ({
    text: async () => '{}',
    headers: { get: () => 'sig' },
})

const completedEvent = (overrides = {}) => ({
    type: 'checkout.session.completed',
    data: {
        object: {
            id: 'cs_test_1',
            payment_intent: 'pi_1',
            customer_details: { email: 'buyer@example.com', name: 'Saba' },
            ...overrides,
        },
    },
})

function baseUser({ userId = 'user_A', cart = [] } = {}) {
    return {
        userId,
        email: 'buyer@example.com',
        cart,
        orderHistory: [],
        save: vi.fn().mockResolvedValue({}),
    }
}

describe('POST /api/webhook/stripe — custom-print payment ownership', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        constructEvent.mockReturnValue(completedEvent())
        CheckoutSession.updateOne.mockResolvedValue({})
        CheckoutSession.findOneAndUpdate.mockResolvedValue({
            sessionId: 'cs_test_1',
            userId: 'user_A',
            processed: false,
        })
        Product.findOne.mockResolvedValue(null) // custom-print base product lookup
        AppSettings.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) })
        paymentIntentsRetrieve.mockResolvedValue(null)
        Order.mockImplementation(function () {
            this.save = vi.fn().mockResolvedValue({})
        })
        sendEmail.mockResolvedValue({})
    })

    it('does not fulfil another user\'s custom-print request (IDOR)', async () => {
        // Attacker "user_A" pays with a cart line pointing at victim "user_B"'s request id.
        User.findOne.mockResolvedValue(
            baseUser({ userId: 'user_A', cart: [{ productId: 'custom-print:victim-req', requestId: 'victim-req', quantity: 1 }] }),
        )
        // The lookup is scoped to { requestId, userId: 'user_A' } — victim's request
        // belongs to user_B, so it must not be found under user_A's scope.
        CustomPrintRequest.findOne.mockResolvedValue(null)

        const res = await POST(fakeRequest())

        expect(res.status).toBe(200)
        expect(CustomPrintRequest.findOne).toHaveBeenCalledWith({ requestId: 'victim-req', userId: 'user_A' })
        expect(notifyCustomPrintEvent).not.toHaveBeenCalled()
    })

    it('fulfils the owner\'s own custom-print request', async () => {
        const save = vi.fn().mockResolvedValue({})
        const request = {
            requestId: 'own-req',
            userId: 'user_A',
            status: 'quoted',
            statusHistory: [],
            quote: { total: 42 },
            basePrice: 0,
            printFee: 0,
            currency: 'sgd',
            save,
            toObject: () => ({ requestId: 'own-req', status: 'paid' }),
        }
        User.findOne.mockResolvedValue(
            baseUser({ userId: 'user_A', cart: [{ productId: 'custom-print:own-req', requestId: 'own-req', quantity: 1 }] }),
        )
        CustomPrintRequest.findOne.mockResolvedValue(request)

        const res = await POST(fakeRequest())

        expect(res.status).toBe(200)
        expect(CustomPrintRequest.findOne).toHaveBeenCalledWith({ requestId: 'own-req', userId: 'user_A' })
        expect(request.status).toBe('paid')
        expect(save).toHaveBeenCalled()
        expect(notifyCustomPrintEvent).toHaveBeenCalledTimes(1)
    })

    it('does not re-fulfil a request that is already paid (idempotent)', async () => {
        const save = vi.fn().mockResolvedValue({})
        const request = {
            requestId: 'already-paid-req',
            userId: 'user_A',
            status: 'paid',
            stripeSessionId: 'cs_previous',
            stripePaymentIntentId: 'pi_previous',
            paidAt: new Date('2026-01-01T00:00:00.000Z'),
            statusHistory: [{ status: 'paid', note: 'Payment completed via Stripe checkout' }],
            quote: { total: 42 },
            basePrice: 0,
            printFee: 0,
            currency: 'sgd',
            save,
            toObject: () => ({ requestId: 'already-paid-req', status: 'paid' }),
        }
        User.findOne.mockResolvedValue(
            baseUser({ userId: 'user_A', cart: [{ productId: 'custom-print:already-paid-req', requestId: 'already-paid-req', quantity: 1 }] }),
        )
        CustomPrintRequest.findOne.mockResolvedValue(request)

        const res = await POST(fakeRequest())

        expect(res.status).toBe(200)
        // Fields untouched by this (second) session's fulfilment attempt.
        expect(request.stripeSessionId).toBe('cs_previous')
        expect(request.stripePaymentIntentId).toBe('pi_previous')
        expect(request.paidAt).toEqual(new Date('2026-01-01T00:00:00.000Z'))
        expect(save).not.toHaveBeenCalled()
        expect(notifyCustomPrintEvent).not.toHaveBeenCalled()
    })
})

describe('POST /api/webhook/stripe — atomic stock decrement', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        constructEvent.mockReturnValue(completedEvent())
        CheckoutSession.updateOne.mockResolvedValue({})
        AppSettings.findById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) })
        paymentIntentsRetrieve.mockResolvedValue(null)
        Order.mockImplementation(function () {
            this.save = vi.fn().mockResolvedValue({})
        })
        sendEmail.mockResolvedValue({})
    })

    it('decrements stock via a single guarded atomic update, never via read-then-save', async () => {
        CheckoutSession.findOneAndUpdate.mockResolvedValue({ sessionId: 'cs_test_1', userId: 'user_A', processed: false })
        User.findOne.mockResolvedValue(
            baseUser({ userId: 'user_A', cart: [{ productId: 'prod_1', quantity: 1, price: 10 }] }),
        )
        Product.findById.mockResolvedValue({
            _id: 'prod_1',
            infiniteStock: false,
            stock: 1,
            variantTypes: [],
            sales: [],
        })
        Product.findOneAndUpdate.mockResolvedValue({ _id: 'prod_1', stock: 0 })

        const res = await POST(fakeRequest())

        expect(res.status).toBe(200)
        expect(Product.findOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ _id: 'prod_1', stock: { $gte: 1 } }),
            expect.objectContaining({ $inc: expect.objectContaining({ stock: -1 }) }),
            expect.anything(),
        )
    })

    it('never oversells: a second concurrent decrement against the same last unit is treated as out-of-stock, not a negative save', async () => {
        CheckoutSession.findOneAndUpdate.mockResolvedValue({ sessionId: 'cs_test_1', userId: 'user_A', processed: false })
        User.findOne.mockResolvedValue(
            baseUser({ userId: 'user_A', cart: [{ productId: 'prod_1', quantity: 1, price: 10 }] }),
        )
        Product.findById.mockResolvedValue({
            _id: 'prod_1',
            infiniteStock: false,
            stock: 1,
            variantTypes: [],
            sales: [],
        })
        // Simulates a concurrent webhook having already consumed the last unit:
        // the guarded update matches nothing.
        Product.findOneAndUpdate.mockResolvedValue(null)

        const res = await POST(fakeRequest())

        // Fulfilment still completes (order recorded); stock is never forced negative.
        expect(res.status).toBe(200)
        expect(Product.updateOne).toHaveBeenCalledWith(
            { _id: 'prod_1' },
            expect.objectContaining({ $push: expect.objectContaining({ sales: expect.anything() }) }),
        )
    })
})
