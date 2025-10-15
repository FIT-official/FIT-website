import { SHOP_CATEGORIES, PRINT_CATEGORIES, SHOP_SUBCATEGORIES, PRINT_SUBCATEGORIES } from './categories.js';

/**
 * Fetches and combines hardcoded categories with admin-created categories
 * @param {string} type - Either 'shop' or 'print'
 * @param {boolean} activeOnly - Whether to return only active categories
 * @returns {Promise<Array>} Combined array of categories
 */
export async function getAllCategories(type, activeOnly = true) {
    try {
        // Get hardcoded categories
        const hardcodedCategories = type === 'shop' ? SHOP_CATEGORIES : PRINT_CATEGORIES;

        // Fetch admin-created categories
        const response = await fetch('/api/admin/settings');
        const data = await response.json();

        if (!response.ok) {
            console.warn('Failed to fetch admin categories, falling back to hardcoded ones');
            return hardcodedCategories;
        }

        // Filter categories by type and active status
        const adminCategories = (data.categories || [])
            .filter(cat => cat.type === type && (!activeOnly || cat.isActive))
            .filter(cat => !cat.isHardcoded) // Exclude hardcoded ones to avoid duplicates
            .map(cat => cat.displayName);

        // Combine hardcoded and admin categories
        return [...hardcodedCategories, ...adminCategories];

    } catch (error) {
        console.error('Error fetching categories:', error);
        // Fallback to hardcoded categories
        return type === 'shop' ? SHOP_CATEGORIES : PRINT_CATEGORIES;
    }
}

/**
 * Fetches and combines hardcoded subcategories with admin-created subcategories
 * @param {string} type - Either 'shop' or 'print'
 * @param {number} categoryIndex - Index of the main category
 * @param {boolean} activeOnly - Whether to return only active subcategories
 * @returns {Promise<Array>} Combined array of subcategories
 */
export async function getAllSubcategories(type, categoryIndex, activeOnly = true) {
    try {
        // Get hardcoded subcategories
        const hardcodedSubcategories = type === 'shop'
            ? (SHOP_SUBCATEGORIES[categoryIndex] || [])
            : (PRINT_SUBCATEGORIES[categoryIndex] || []);

        // For now, return hardcoded subcategories since admin subcategories aren't implemented yet
        // TODO: Implement admin subcategory management
        return hardcodedSubcategories;

    } catch (error) {
        console.error('Error fetching subcategories:', error);
        // Fallback to hardcoded subcategories
        return type === 'shop'
            ? (SHOP_SUBCATEGORIES[categoryIndex] || [])
            : (PRINT_SUBCATEGORIES[categoryIndex] || []);
    }
}

/**
 * Server-side version that can be used in API routes
 * @param {string} type - Either 'shop' or 'print'  
 * @param {boolean} activeOnly - Whether to return only active categories
 * @returns {Promise<Array>} Combined array of categories
 */
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
        }        // Get hardcoded categories
        const hardcodedCategories = type === 'shop' ? SHOP_CATEGORIES : PRINT_CATEGORIES;

        // Get admin categories
        const adminCategories = (settings.additionalCategories || [])
            .filter(cat => cat.type === type && (!activeOnly || cat.isActive))
            .map(cat => cat.displayName);

        // Combine hardcoded and admin categories
        return [...hardcodedCategories, ...adminCategories];

    } catch (error) {
        console.error('Error fetching categories server-side:', error);
        // Fallback to hardcoded categories
        return type === 'shop' ? SHOP_CATEGORIES : PRINT_CATEGORIES;
    }
}

/**
 * Maps category name to index, including admin-created categories
 * @param {string} categoryName - Name of the category
 * @param {string} type - Either 'shop' or 'print'
 * @returns {Promise<number>} Index of the category (-1 if not found)
 */
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