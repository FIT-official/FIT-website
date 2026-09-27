// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const database = vi.hoisted(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    findById: vi.fn(),
    save: vi.fn(),
}))

vi.mock('dotenv', () => ({ default: { config: vi.fn() } }))
vi.mock('mongoose', () => ({ default: { disconnect: database.disconnect } }))
vi.mock('@/lib/db.js', () => ({ connectToDatabase: database.connect }))
vi.mock('@/models/AppSettings.js', () => ({ default: { findById: database.findById } }))
vi.mock('@/lib/quoting/genericPresets.js', () => ({ DEFAULT_PRINT_COLOURS: [] }))

const originalArgv = process.argv
const originalExitCode = process.exitCode

beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    // Connection and dotenv modules are mocked; this sentinel never reaches a driver.
    vi.stubEnv('MONGODB_URI', 'mocked-connection')
    process.argv = [originalArgv[0], 'mongo-script-test']
    process.exitCode = undefined
    database.connect.mockResolvedValue(undefined)
    database.disconnect.mockResolvedValue(undefined)
    database.findById.mockResolvedValue(null)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('Unexpected forced exit') })
})

afterEach(() => {
    process.argv = originalArgv
    process.exitCode = originalExitCode
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
})

async function expectCleanup() {
    await vi.waitFor(() => expect(database.disconnect).toHaveBeenCalledTimes(1))
    expect(process.exit).not.toHaveBeenCalled()
}

describe('MongoDB one-shot script lifecycle', () => {
    it('closes the category check when no settings exist', async () => {
        await import('../../scripts/check-categories.js')
        await expectCleanup()
        expect(database.connect).toHaveBeenCalledTimes(1)
        expect(process.exitCode).toBeUndefined()
    })

    it('closes category activation on its early return', async () => {
        await import('../../scripts/activate-all-categories.js')
        await expectCleanup()
        expect(database.findById).toHaveBeenCalledTimes(1)
        expect(process.exitCode).toBeUndefined()
    })

    it('closes a skipped colour seed without writing settings', async () => {
        database.findById.mockResolvedValue({ printColours: [{ name: 'Black' }], save: database.save })
        await import('../../scripts/seed-print-colours.js')
        await expectCleanup()
        expect(database.findById).toHaveBeenCalled()
        expect(database.save).not.toHaveBeenCalled()
        expect(process.exitCode).toBeUndefined()
    })

    it('waits for cleanup before reporting a failed migration', async () => {
        const failure = new Error('Connection unavailable')
        database.connect.mockRejectedValue(failure)
        let finishDisconnect
        database.disconnect.mockReturnValue(new Promise(resolve => { finishDisconnect = resolve }))

        await import('../../lib/migrations/migrateLegacyCategoriesToAppSettings.js')
        await expectCleanup()
        expect(process.exitCode).toBeUndefined()
        expect(console.error).not.toHaveBeenCalled()
        finishDisconnect()
        await vi.waitFor(() => expect(process.exitCode).toBe(1))
        expect(console.error).toHaveBeenCalledWith('Migration failed:', failure)
        expect(database.findById).not.toHaveBeenCalled()
    })

    it('closes a category check after a query fails', async () => {
        const failure = new Error('Query failed')
        database.findById.mockRejectedValue(failure)
        await import('../../scripts/check-categories.js')
        await expectCleanup()
        await vi.waitFor(() => expect(process.exitCode).toBe(1))
        expect(console.error).toHaveBeenCalledWith('Error:', failure)
    })
})
