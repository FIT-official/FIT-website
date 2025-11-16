/**
 * Form Helpers Index
 * Central export point for all form helper functions
 */

// Product form helpers
export {
    mapProductToForm,
    buildProductPayload,
    cleanupUploadedFiles
} from './productFormHelpers';

// File validation helpers
export {
    MAX_IMAGE_SIZE,
    MAX_MODEL_SIZE,
    MAX_VIEWABLE_SIZE,
    ALLOWED_MODEL_EXTS,
    ALLOWED_VIEWABLE_EXTS,
    validateImageFiles,
    validateModelFiles,
    validateViewableModel
} from './fileValidationHelpers';

// File upload handlers
export {
    handleImageChange,
    handleImageDrop,
    handleRemoveImage,
    handleModelChange,
    handleModelDrop,
    handleRemoveModel,
    handleViewableModelChange,
    handleRemoveViewableModel
} from './fileUploadHandlers';
