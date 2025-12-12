#!/usr/bin/env node

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

async function activateAllCategories() {
    const { connectToDatabase } = await import('../lib/db.js')
    const AppSettingsModel = (await import('../models/AppSettings.js')).default

    await connectToDatabase()

    const settings = await AppSettingsModel.findById('app-settings')

    if (!settings) {
        console.log('No app settings found!')
        return
    }

    let updated = false

    settings.additionalCategories.forEach((cat, catIdx) => {
        if (!cat.isActive) {
            cat.isActive = true
            updated = true
            console.log(`✅ Activated category: ${cat.displayName}`)
        }

        if (cat.subcategories) {
            cat.subcategories.forEach((sub, subIdx) => {
                if (!sub.isActive) {
                    sub.isActive = true
                    updated = true
                    console.log(`  ✅ Activated subcategory: ${sub.displayName}`)
                }
            })
        }

        // Mark as modified to ensure Mongoose saves it
        if (updated) {
            settings.markModified(`additionalCategories.${catIdx}`)
        }
    })

    if (updated) {
        await settings.save()
        console.log('\n✅ All categories and subcategories are now active!')
    } else {
        console.log('\n✅ All categories and subcategories were already active!')
    }

    process.exit(0)
}

activateAllCategories().catch(err => {
    console.error('Error:', err)
    process.exit(1)
})
