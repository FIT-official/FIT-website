/**
 * File Validation Helper Functions
 * Handles validation for images, models, and viewable 3D models
 */

// Constants
export const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB
export const MAX_MODEL_SIZE = 100 * 1024 * 1024; // 100MB
export const MAX_VIEWABLE_SIZE = 15 * 1024 * 1024; // 15MB
export const ALLOWED_MODEL_EXTS = ['obj', 'glb', 'gltf', 'stl', 'blend', 'fbx', 'zip', 'rar', '7z', '3mf'];
export const ALLOWED_VIEWABLE_EXTS = ['glb', 'gltf'];

/**
 * Validates image files for size and type
 * @param {FileList|Array} files - Files to validate
 * @returns {Object} - { errors: string[], validFiles: File[] }
 */
export function validateImageFiles(files) {
    const errors = [];
    const validFiles = [];

    Array.from(files).forEach((file) => {
        // Check file type
        if (!file.type.startsWith('image/')) {
            errors.push(`File "${file.name}" is not a valid image file.`);
            return;
        }

        // Check file size
        if (file.size > MAX_IMAGE_SIZE) {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
            errors.push(`File "${file.name}" is too large (${sizeMB}MB). Maximum size is 2MB.`);
            return;
        }

        validFiles.push(file);
    });

    return { errors, validFiles };
}

/**
 * Validates 3D model files for extension and size
 * @param {FileList|Array} files - Files to validate
 * @returns {Object} - { errors: string[], validFiles: File[] }
 */
export function validateModelFiles(files) {
    const errors = [];
    const validFiles = [];

    Array.from(files).forEach((file) => {
        const ext = file.name.split('.').pop()?.toLowerCase();

        // Check file extension
        if (!ext || !ALLOWED_MODEL_EXTS.includes(ext)) {
            errors.push(`File "${file.name}" has an unsupported format. Allowed: ${ALLOWED_MODEL_EXTS.join(', ')}`);
            return;
        }

        // Check file size
        if (file.size > MAX_MODEL_SIZE) {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
            errors.push(`File "${file.name}" is too large (${sizeMB}MB). Maximum size is 100MB.`);
            return;
        }

        validFiles.push(file);
    });

    return { errors, validFiles };
}

/**
 * Validates a single viewable 3D model file
 * @param {File} file - File to validate
 * @returns {Object} - { errors: string[], validFile: File|null }
 */
export function validateViewableModel(file) {
    const errors = [];

    if (!file) return { errors, validFile: null };

    const ext = file.name.split('.').pop()?.toLowerCase();

    // Check file extension
    if (!ext || !ALLOWED_VIEWABLE_EXTS.includes(ext)) {
        errors.push(`File "${file.name}" has an unsupported format. Allowed: ${ALLOWED_VIEWABLE_EXTS.join(', ')}`);
        return { errors, validFile: null };
    }

    // Check file size
    if (file.size > MAX_VIEWABLE_SIZE) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        errors.push(`File "${file.name}" is too large (${sizeMB}MB). Maximum size is 15MB.`);
        return { errors, validFile: null };
    }

    return { errors, validFile: file };
}
