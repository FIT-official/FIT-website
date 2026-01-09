import dotenv from 'dotenv'
import { SHOP_CATEGORIES, PRINT_CATEGORIES, SHOP_SUBCATEGORIES, PRINT_SUBCATEGORIES } from '../categories.js'

// Load environment variables from .env.local by default (override with ENV_FILE)
dotenv.config({ path: process.env.ENV_FILE || '.env.local' })

function slugifyName(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

async function migrate() {
    console.log('Starting legacy categories -> AppSettings migration')

    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI not found in environment. Please create a .env.local with MONGODB_URI="your_uri" or set ENV_FILE to point to the env file.')
        process.exit(1)
    }

    // Dynamically import db and models AFTER dotenv has run, to avoid import-time errors
    const { connectToDatabase } = await import('../db.js')
    const AppSettingsModel = (await import('../../models/AppSettings.js')).default

    await connectToDatabase()

    const appSettingsId = process.env.NODE_ENV === 'development' ? 'app-settings-dev' : 'app-settings';
    let settings = await AppSettingsModel.findById(appSettingsId)
    if (!settings) {
        settings = new AppSettingsModel({
            _id: appSettingsId,
            additionalDeliveryTypes: [],
            additionalOrderStatuses: [],
            additionalCategories: []
        })
    }

    // Helper to upsert a category
    function upsertCategory(type, displayName, order, subcats = []) {
        const name = slugifyName(displayName)
        const catIndex = (settings.additionalCategories || []).findIndex(c => c.name === name && c.type === type)

        let cat
        if (catIndex === -1) {
            // Create new category
            cat = {
                name,
                displayName,
                type,
                description: '',
                order,
                isActive: true,
                subcategories: []
            }
            settings.additionalCategories.push(cat)
            console.log(`Created category ${type}:${displayName}`)
        } else {
            // Update existing category (get reference from array)
            cat = settings.additionalCategories[catIndex]
            cat.displayName = displayName
            cat.order = order
            if (typeof cat.isActive === 'undefined') cat.isActive = true
            if (!cat.subcategories) cat.subcategories = []
            console.log(`Updated category ${type}:${displayName}`)
        }

        // Upsert subcategories
        subcats.forEach((subDisplay, idx) => {
            const subName = slugifyName(subDisplay)
            const subIndex = cat.subcategories.findIndex(s => s.name === subName)

            if (subIndex === -1) {
                const newSub = { name: subName, displayName: subDisplay, isActive: true }
                cat.subcategories.push(newSub)
                console.log(`  -> added subcategory ${subDisplay} under ${displayName}`)
            } else {
                cat.subcategories[subIndex].displayName = subDisplay
                if (typeof cat.subcategories[subIndex].isActive === 'undefined') {
                    cat.subcategories[subIndex].isActive = true
                }
            }
        })

        // Mark the subcategories array as modified for Mongoose
        if (catIndex !== -1) {
            settings.markModified(`additionalCategories.${catIndex}.subcategories`)
        }
    }

    // Migrate shop categories
    SHOP_CATEGORIES.forEach((catName, i) => {
        const subcats = SHOP_SUBCATEGORIES[i] || []
        upsertCategory('shop', catName, i, subcats)
    })

    // Migrate print categories
    PRINT_CATEGORIES.forEach((catName, i) => {
        const subcats = PRINT_SUBCATEGORIES[i] || []
        upsertCategory('print', catName, i, subcats)
    })

    await settings.save()
    console.log('Migration complete. AppSettings updated.')
}

migrate().catch(err => {
    console.error('Migration failed:', err)
    process.exit(1)
})

export default migrate
