// categoriesHelper reads categories and subcategories from the AppSettings stored in MongoDB
// and combines them with the legacy hardcoded lists so server-side APIs can still
// resolve legacy category names when admin DB is empty.
import { SHOP_CATEGORIES, PRINT_CATEGORIES, SHOP_SUBCATEGORIES, PRINT_SUBCATEGORIES } from './categories.js';

export async function getAllCategories(type, activeOnly = true) {
    try {
        // Fetch admin-created categories from the settings API
        const response = await fetch('/api/admin/settings');
        const data = await response.json();

        if (!response.ok) {
            console.warn('Failed to fetch admin categories; returning hardcoded list');
            return type === 'shop' ? SHOP_CATEGORIES : PRINT_CATEGORIES;
        }

        const hardcoded = type === 'shop' ? SHOP_CATEGORIES : PRINT_CATEGORIES;
        const adminCategories = (data.categories || [])
            .filter(cat => cat.type === type && (!activeOnly || cat.isActive))
            .map(cat => cat.displayName);

        // Return combined list so legacy category names still resolve to indices
        return [...hardcoded, ...adminCategories];

    } catch (error) {
        console.error('Error fetching categories:', error);
        // Fallback to hardcoded categories
        return type === 'shop' ? SHOP_CATEGORIES : PRINT_CATEGORIES;
    }
}

/**
 * Fetch client-side subcategories for a combined categories list
 */
export async function getAllSubcategories(type, categoryIndex, activeOnly = true) {
    try {
        const response = await fetch('/api/admin/settings');
        const data = await response.json();
        if (!response.ok) return [];

        const hardcodedCats = type === 'shop' ? SHOP_CATEGORIES : PRINT_CATEGORIES;
        const hardcodedSubcats = type === 'shop' ? SHOP_SUBCATEGORIES : PRINT_SUBCATEGORIES;

        const adminCats = (data.categories || []).filter(cat => cat.type === type && (!activeOnly || cat.isActive));

        // If the requested index refers to a hardcoded category, return its hardcoded subcats
        if (categoryIndex < hardcodedCats.length) {
            return hardcodedSubcats[categoryIndex] || [];
        }

        // Otherwise map into adminCats
        const adminIndex = categoryIndex - hardcodedCats.length;
        const cat = adminCats[adminIndex];
        if (!cat) return [];
        return (cat.subcategories || []).filter(sc => (!activeOnly || sc.isActive)).map(sc => sc.displayName);

    } catch (error) {
        console.error('Error fetching subcategories:', error);
        // On error return empty
        return [];
    }
}

/**
 * Server-side version to get subcategories for a combined categories list
 */
export async function getAllSubcategoriesServer(type, categoryIndex, activeOnly = true) {
    try {
        const AppSettings = await import('@/models/AppSettings');
        const { connectToDatabase } = await import('@/lib/db');

        await connectToDatabase();

        let settings = await AppSettings.default.findOne();
        if (!settings) {
            settings = new AppSettings.default();
            await settings.save();
        }

        const hardcodedCats = type === 'shop' ? SHOP_CATEGORIES : PRINT_CATEGORIES;
        const hardcodedSubcats = type === 'shop' ? SHOP_SUBCATEGORIES : PRINT_SUBCATEGORIES;

        const adminCats = (settings.additionalCategories || [])
            .filter(cat => cat.type === type && (!activeOnly || cat.isActive));

        // If the requested index refers to a hardcoded category, return its hardcoded subcats
        if (categoryIndex < hardcodedCats.length) {
            return hardcodedSubcats[categoryIndex] || [];
        }

        // Otherwise map into adminCats
        const adminIndex = categoryIndex - hardcodedCats.length;
        const cat = adminCats[adminIndex];
        if (!cat) return [];
        return (cat.subcategories || []).filter(sc => (!activeOnly || sc.isActive)).map(sc => sc.displayName);

    } catch (error) {
        console.error('Error fetching server-side subcategories:', error);
        return [];
    }
}

export async function getAllCategoriesServer(type, activeOnly = true) {
    try {
        const AppSettings = await import('@/models/AppSettings');
        const { connectToDatabase } = await import('@/lib/db');

        await connectToDatabase();

        // Get or create app settings
        let settings = await AppSettings.default.findOne();
        if (!settings) {
            settings = new AppSettings.default();
            await settings.save();
        }

        const hardcoded = type === 'shop' ? SHOP_CATEGORIES : PRINT_CATEGORIES;
        const adminCategories = (settings.additionalCategories || [])
            .filter(cat => cat.type === type && (!activeOnly || cat.isActive))
            .map(cat => cat.displayName);

        // Return combined list so legacy category names still resolve to indices
        return [...hardcoded, ...adminCategories];

    } catch (error) {
        console.error('Error fetching categories server-side:', error);
        // Fallback to hardcoded categories
        return type === 'shop' ? SHOP_CATEGORIES : PRINT_CATEGORIES;
    }
}


export async function getCategoryIndex(categoryName, type) {
    try {
        const allCategories = await getAllCategories(type);
        return allCategories.findIndex(cat => cat === categoryName);
    } catch (error) {
        console.error('Error getting category index:', error);
        const hardcodedCategories = type === 'shop' ? SHOP_CATEGORIES : PRINT_CATEGORIES;
        return hardcodedCategories.findIndex(cat => cat === categoryName);
    }
}