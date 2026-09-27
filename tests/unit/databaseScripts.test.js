// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mongoose, stripe, settings, sessions, collection } = vi.hoisted(() => {
    const collection = { find: vi.fn(), toArray: vi.fn(), updateOne: vi.fn() }
    return {
        collection,
        mongoose: {
            connect: vi.fn(), disconnect: vi.fn(),
            connection: { db: { collection: vi.fn(() => collection) } },
        },
        stripe: { products: { list: vi.fn() }, prices: { list: vi.fn() } },
        settings: { findOneAndUpdate: vi.fn(), findById: vi.fn() },
        sessions: { findOne: vi.fn() },
    }
})

vi.mock('mongoose', () => ({ default: mongoose }))
vi.mock('stripe', () => ({ default: vi.fn(function () { return stripe }) }))
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }))
vi.mock('nodemailer', () => ({ default: { createTransport: vi.fn(() => ({})) } }))
vi.mock('@/models/AppSettings.js', () => ({ default: settings }))
vi.mock('@/models/CheckoutSession.js', () => ({ default: sessions }))
vi.mock('@/models/User.js', () => ({ default: {} }))
vi.mock('@/lib/db.js', () => ({ connectToDatabase: () => mongoose.connect() }))
vi.mock('@/lib/blog/normalizeContent.js', () => ({ normalizeToTiptap: vi.fn() }))
vi.mock('@/lib/appSettingsId.js', () => ({ getAppSettingsId: () => 'unit-test-settings' }))
vi.mock('@/lib/quoting/genericPresets.js', () => ({ DEFAULT_PRINT_COLOURS: [] }))

const uri = 'mongodb://example.invalid/unit-test'
const originalExitCode = process.exitCode
const originalArgv = process.argv

beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    // These values exist only in mocked tests; no service or env file is used.
    vi.stubEnv('MONGODB_URI', uri)
    vi.stubEnv('STRIPE_API_KEY', 'unit-test-only')
    process.exitCode = undefined
    process.argv = ['node', 'script', 'unit-test-session']
    vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('Unexpected forced exit') })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mongoose.connect.mockResolvedValue(mongoose)
    mongoose.disconnect.mockResolvedValue(undefined)
    collection.find.mockReturnValue(collection)
    collection.toArray.mockResolvedValue([])
})

afterEach(() => {
    process.exitCode = originalExitCode
    process.argv = originalArgv
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
})

const directScripts = [
    ['fetch Stripe prices', () => import('../../scripts/fetch-stripe-products-to-appsettings.js')],
    ['sync app settings', () => import('../../scripts/sync-appsettings-env.js')],
    ['set price tiers', () => import('../../scripts/set-prod-appsettings-price-tiers.js')],
    ['publish Stripe products', () => import('../../scripts/publish-stripe-products.js')],
    ['send confirmation email', () => import('../../scripts/send-confirmation-email.js')],
]

describe('database script cleanup', () => {
    it.each(directScripts)('%s closes a failed connection attempt and returns a failure status', async (_name, load) => {
        mongoose.connect.mockRejectedValueOnce(new Error('Connection unavailable'))
        await load()
        await vi.waitFor(() => expect(process.exitCode).toBe(1))
        expect(mongoose.connect).toHaveBeenCalledWith(uri, {
            maxPoolSize: 5, minPoolSize: 0, maxIdleTimeMS: 60000,
        })
        expect(mongoose.disconnect).toHaveBeenCalledTimes(1)
        expect(process.exit).not.toHaveBeenCalled()
    })

    it('closes MongoDB when a subsequent Stripe request fails', async () => {
        stripe.products.list.mockRejectedValueOnce(new Error('Stripe unavailable'))
        await import('../../scripts/fetch-stripe-products-to-appsettings.js')
        await vi.waitFor(() => expect(process.exitCode).toBe(1))
        expect(stripe.products.list).toHaveBeenCalledTimes(1)
        expect(settings.findOneAndUpdate).not.toHaveBeenCalled()
        expect(mongoose.disconnect).toHaveBeenCalledTimes(1)
        expect(process.exit).not.toHaveBeenCalled()
    })

    it('waits for disconnect to finish before reporting a script failure', async () => {
        let finishDisconnect
        mongoose.disconnect.mockReturnValueOnce(new Promise(resolve => { finishDisconnect = resolve }))
        settings.findOneAndUpdate.mockRejectedValueOnce(new Error('Write failed'))
        await import('../../scripts/set-prod-appsettings-price-tiers.js')
        await vi.waitFor(() => expect(mongoose.disconnect).toHaveBeenCalledTimes(1))
        expect(process.exitCode).toBeUndefined()
        finishDisconnect()
        await vi.waitFor(() => expect(process.exitCode).toBe(1))
        expect(process.exit).not.toHaveBeenCalled()
    })

    it('closes the legacy conversion client after a successful dry run without writing', async () => {
        await import('../../scripts/convert-legacy-html-posts.mjs')
        expect(collection.updateOne).not.toHaveBeenCalled()
        expect(mongoose.disconnect).toHaveBeenCalledTimes(1)
        expect(process.exitCode).toBeUndefined()
    })

    it('closes the legacy conversion client when its query fails', async () => {
        const failure = new Error('Query failed')
        collection.toArray.mockRejectedValueOnce(failure)
        await expect(import('../../scripts/convert-legacy-html-posts.mjs')).rejects.toBe(failure)
        expect(mongoose.disconnect).toHaveBeenCalledTimes(1)
        expect(collection.updateOne).not.toHaveBeenCalled()
    })

    it('closes the seed client on the existing-catalogue early return', async () => {
        const save = vi.fn()
        settings.findById.mockResolvedValueOnce({ printColours: [{ id: 'existing' }], save })
        await import('../../scripts/seed-print-colours.js')
        await vi.waitFor(() => expect(mongoose.disconnect).toHaveBeenCalledTimes(1))
        expect(save).not.toHaveBeenCalled()
        expect(process.exit).not.toHaveBeenCalled()
        expect(process.exitCode).toBeUndefined()
    })
})
