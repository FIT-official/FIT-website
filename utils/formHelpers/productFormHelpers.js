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

    const discount = {
        eventId: product.discount?.eventId ?? "",
        percentage: product.discount?.percentage ?? "",
        minimumPrice: product.discount?.minimumAmount ?? "",
        startDate: product.discount?.startDate
            ? new Date(product.discount.startDate).toISOString().slice(0, 10)
            : "",
        endDate: product.discount?.endDate
            ? new Date(product.discount.endDate).toISOString().slice(0, 10)
            : "",
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
        showDiscount: !!(
            discount.percentage ||
            discount.eventId ||
            discount.minimumPrice ||
            discount.startDate ||
            discount.endDate
        ),
        discount,
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
        discount: form.showDiscount ? {
            eventId: form.discount.eventId || null,
            percentage: form.discount.percentage ? Number(form.discount.percentage) : undefined,
            minimumAmount: form.discount.minimumPrice ? Number(form.discount.minimumPrice) : undefined,
            startDate: form.discount.startDate ? new Date(form.discount.startDate) : undefined,
            endDate: form.discount.endDate ? new Date(form.discount.endDate) : undefined,
        } : {},
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
