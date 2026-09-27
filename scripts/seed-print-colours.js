#!/usr/bin/env node

/**
 * Preload the print-colour catalogue into AppSettings.printColours.
 *
 * The editor's Advanced-mode colour dropdown and the simple-mode colour picker
 * both read AppSettings.printColours (via /api/quote/config). Until an admin
 * curates the list in Admin → Quoting & Pricing, this seeds the built-in
 * DEFAULT_PRINT_COLOURS so customers have real colours to choose from.
 *
 * Idempotent: by default it only seeds when the catalogue is empty. Pass
 * `--force` to overwrite an existing catalogue with the defaults.
 *
 *   node scripts/seed-print-colours.js
 *   node scripts/seed-print-colours.js --force
 */

import dotenv from 'dotenv'
import mongoose from 'mongoose'
dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

async function seedPrintColours() {
    const force = process.argv.includes('--force')

    const { connectToDatabase } = await import('../lib/db.js')
    const AppSettingsModel = (await import('../models/AppSettings.js')).default
    const { getAppSettingsId } = await import('../lib/appSettingsId.js')
    const { DEFAULT_PRINT_COLOURS } = await import('../lib/quoting/genericPresets.js')

    await connectToDatabase()

    const id = getAppSettingsId()
    let settings = await AppSettingsModel.findById(id)
    if (!settings) {
        settings = new AppSettingsModel({ _id: id })
        console.log(`Created new AppSettings document "${id}".`)
    }

    const existing = settings.printColours || []
    if (existing.length > 0 && !force) {
        console.log(
            `✅ printColours already has ${existing.length} colour(s); leaving it untouched. ` +
                `Re-run with --force to overwrite with the defaults.`,
        )
        return
    }

    // Strip the Object.freeze wrapper into plain objects for Mongoose.
    settings.printColours = DEFAULT_PRINT_COLOURS.map((c) => ({
        name: c.name,
        hex: c.hex,
        material: c.material ?? null,
        priceModifier: c.priceModifier ?? null,
    }))
    settings.markModified('printColours')
    await settings.save()

    console.log(
        `✅ Seeded ${settings.printColours.length} print colours into AppSettings "${id}"` +
            (force && existing.length > 0 ? ` (overwrote ${existing.length} existing).` : '.'),
    )
}

seedPrintColours().finally(() => mongoose.disconnect()).catch((err) => {
    console.error('Error seeding print colours:', err)
    process.exitCode = 1
})
