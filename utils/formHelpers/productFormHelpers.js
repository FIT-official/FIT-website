/**
 * Product Form Helper Functions
 * Extracted from ProductForm.jsx to improve maintainability
 */

/**
 * Maps a product object from the database to the form state structure
 * @param {Object} product - The product object from the database
 * @param {Object} defaultForm - The default form structure
 * @returns {Object} - Mapped form state
 */
export function mapProductToForm(product, defaultForm) {
    // Extract delivery info from product
    const delivery = product.delivery || { deliveryTypes: [] };

    // Support both legacy single discount and new stacked discounts array
    const rawDiscounts = Array.isArray(product.discounts) && product.discounts.length
        ? product.discounts
        : (product.discount ? [product.discount] : []);

    const normalizeDiscount = (disc) => ({
        eventId: disc?.eventId ?? "",
        percentage: disc?.percentage ?? "",
        minimumPrice: disc?.minimumAmount ?? "",
        startDate: disc?.startDate
            ? new Date(disc.startDate).toISOString().slice(0, 10)
            : "",
        endDate: disc?.endDate
            ? new Date(disc.endDate).toISOString().slice(0, 10)
            : "",
        tiers: Array.isArray(disc?.tiers) ? disc.tiers : [],
    });

    const discounts = rawDiscounts.map(normalizeDiscount);

    // For backwards compatibility, keep a single `discount` in form pointing
    // at the first discount rule (if any). The UI can evolve to show all.
    const primaryDiscount = discounts[0] || {
        eventId: "",
        percentage: "",
        minimumPrice: "",
        startDate: "",
        endDate: "",
        tiers: [],
    };

    return {
        ...defaultForm,
        ...product,
        images: product.images || [],
        paidAssets: product.paidAssets || [],
        variants: Array.isArray(product.variants) ? product.variants : [],
        delivery, // Use the delivery object directly
        categoryId: product.categoryId || "",
        subcategoryId: product.subcategoryId || "",
        showDiscount: discounts.some(d =>
            d.percentage ||
            d.eventId ||
            d.minimumPrice ||
            d.startDate ||
            d.endDate ||
            (d.tiers && d.tiers.length > 0)
        ),
        discount: primaryDiscount,
        discounts,
    };
}

/**
 * Builds the API payload from form state for product creation/update
 * @param {Object} form - The form state
 * @param {Object} user - The current user object
 * @param {Array} uploadedImages - URLs of uploaded images
 * @param {Array} uploadedModels - URLs of uploaded models
 * @param {string} uploadedViewable - URL of uploaded viewable model
 * @returns {Object} - API payload
 */
export function buildProductPayload(form, user, uploadedImages, uploadedModels, uploadedViewable) {
    // Build a single normalized discount object (for legacy field)
    const buildOneDiscount = (disc) => ({
        eventId: disc.eventId || null,
        percentage: disc.percentage ? Number(disc.percentage) : undefined,
        minimumAmount: disc.minimumPrice ? Number(disc.minimumPrice) : undefined,
        startDate: disc.startDate ? new Date(disc.startDate) : undefined,
        endDate: disc.endDate ? new Date(disc.endDate) : undefined,
        tiers: Array.isArray(disc.tiers)
            ? disc.tiers
                .filter(t => t && (t.minQty || t.maxQty) && t.percentage)
                .map(t => ({
                    minQty: Number(t.minQty) || 1,
                    maxQty: t.maxQty ? Number(t.maxQty) : undefined,
                    percentage: Number(t.percentage) || 0,
                }))
            : [],
    });

    // Derive stacked discounts from form; include legacy `discount` for now
    const stackedDiscounts = Array.isArray(form.discounts) && form.discounts.length
        ? form.discounts.filter(d => d && (d.eventId || d.percentage || d.minimumPrice || (d.tiers && d.tiers.length)))
        : (form.showDiscount && form.discount
            ? [form.discount]
            : []);

    const normalizedStacked = stackedDiscounts.map(buildOneDiscount);

    const legacyDiscount = form.showDiscount && form.discount
        ? buildOneDiscount(form.discount)
        : {};

    return {
        creatorUserId: user?.id,
        name: form.name,
        description: form.description,
        images: [...form.images, ...uploadedImages],
        paidAssets: [...form.paidAssets, ...uploadedModels],
        viewableModel: uploadedViewable ? uploadedViewable : form.viewableModel,
        productType: form.productType,
        basePrice: {
            presentmentCurrency: form.basePrice?.presentmentCurrency || 'SGD',
            presentmentAmount: Number(form.basePrice?.presentmentAmount) || 0,
        },
        priceCredits: Number(form.priceCredits) || 0,
        stock: Number(form.stock) || 1,
        variantTypes: form.variantTypes || [],
        category: Number(form.category),
        subcategory: Number(form.subcategory),
        categoryId: form.categoryId || null,
        subcategoryId: form.subcategoryId || null,
        variants: form.variants,
        delivery: form.delivery || { deliveryTypes: [] }, // Use the delivery object directly from form
        dimensions: {
            length: Number(form.dimensions.length),
            width: Number(form.dimensions.width),
            height: Number(form.dimensions.height),
            weight: Number(form.dimensions.weight),
        },
        hidden: !!form.hidden,
        // Keep legacy single-discount field for existing consumers
        discount: legacyDiscount,
        // New stacked discounts array for advanced scenarios / stacking
        discounts: normalizedStacked,
    };
}

/**
 * Cleans up uploaded files from S3 in case of failure
 * @param {Array<string>} filePaths - Array of file paths to delete
 */
export async function cleanupUploadedFiles(filePaths) {
    try {
        const response = await fetch('/api/upload/cleanup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: filePaths })
        });

        if (!response.ok) {
            console.error('File cleanup failed:', await response.text());
        }
    } catch (error) {
        console.error('File cleanup error:', error);
    }
}
