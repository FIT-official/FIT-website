#!/usr/bin/env node

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

async function checkCategories() {
    const { connectToDatabase } = await import('../lib/db.js')
    const AppSettingsModel = (await import('../models/AppSettings.js')).default

    await connectToDatabase()

    const settings = await AppSettingsModel.findById('app-settings')

    if (!settings) {
        console.log('No app settings found!')
        return
    }

    console.log('\n=== SHOP CATEGORIES ===')
    const shopCats = settings.additionalCategories.filter(c => c.type === 'shop')
    shopCats.forEach(cat => {
        console.log(`\n${cat.displayName} (${cat.name}) - Active: ${cat.isActive}`)
        if (cat.subcategories && cat.subcategories.length > 0) {
            cat.subcategories.forEach(sub => {
                console.log(`  - ${sub.displayName} (${sub.name}) - Active: ${sub.isActive}`)
            })
        } else {
            console.log('  (no subcategories)')
        }
    })

    console.log('\n=== PRINT CATEGORIES ===')
    const printCats = settings.additionalCategories.filter(c => c.type === 'print')
    printCats.forEach(cat => {
        console.log(`\n${cat.displayName} (${cat.name}) - Active: ${cat.isActive}`)
        if (cat.subcategories && cat.subcategories.length > 0) {
            cat.subcategories.forEach(sub => {
                console.log(`  - ${sub.displayName} (${sub.name}) - Active: ${sub.isActive}`)
            })
        } else {
            console.log('  (no subcategories)')
        }
    })

    process.exit(0)
}

checkCategories().catch(err => {
    console.error('Error:', err)
    process.exit(1)
})
