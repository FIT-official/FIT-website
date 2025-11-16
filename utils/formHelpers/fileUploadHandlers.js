/**
 * File Upload Handler Functions
 * Handles file change and drop events for images, models, and viewable models
 */

import {
    validateImageFiles,
    validateModelFiles,
    validateViewableModel
} from './fileValidationHelpers';

/**
 * Handles image file input change
 * @param {Event} e - Input change event
 * @param {Function} setPendingImages - State setter for pending images
 * @param {Function} setImageValidationErrors - State setter for validation errors
 */
export function handleImageChange(e, setPendingImages, setImageValidationErrors) {
    const { errors, validFiles } = validateImageFiles(e.target.files);

    setImageValidationErrors(errors);

    if (validFiles.length > 0) {
        setPendingImages(prev => [...prev, ...validFiles]);
    }

    if (errors.length > 0 && e.target) {
        e.target.value = '';
        setTimeout(() => {
            setImageValidationErrors([]);
        }, 5000);
    }
}

/**
 * Handles image file drag and drop
 * @param {FileList} fileList - Dropped files
 * @param {Function} setPendingImages - State setter for pending images
 * @param {Function} setImageValidationErrors - State setter for validation errors
 */
export function handleImageDrop(fileList, setPendingImages, setImageValidationErrors) {
    const { errors, validFiles } = validateImageFiles(fileList);
    setImageValidationErrors(errors);
    if (validFiles.length > 0) {
        setPendingImages(prev => [...prev, ...validFiles]);
    }
    if (errors.length > 0) {
        setTimeout(() => {
            setImageValidationErrors([]);
        }, 5000);
    }
}

/**
 * Handles removing an image from the form
 * @param {number} idx - Index of image to remove
 * @param {Object} form - Current form state
 * @param {Function} setForm - Form state setter
 * @param {Array} pendingImages - Array of pending image files
 * @param {Function} setPendingImages - State setter for pending images
 * @param {Object} imageInputRef - Ref to file input element
 * @param {Function} setImageValidationErrors - State setter for validation errors
 */
export function handleRemoveImage(idx, form, setForm, pendingImages, setPendingImages, imageInputRef, setImageValidationErrors) {
    let newPendingImages = pendingImages;

    if (idx < (form.images?.length || 0)) {
        setForm(f => ({
            ...f,
            images: f.images.filter((_, i) => i !== idx)
        }));
    } else {
        newPendingImages = pendingImages.filter((_, i) => i !== (idx - (form.images?.length || 0)));
        setPendingImages(newPendingImages);
    }

    if (imageInputRef.current) {
        imageInputRef.current.value = "";
    }

    // Re-validate remaining pending images
    if (newPendingImages.length > 0) {
        const { errors } = validateImageFiles(newPendingImages);
        setImageValidationErrors(errors);
    } else {
        setImageValidationErrors([]);
    }
}

/**
 * Handles model file input change
 * @param {Event} e - Input change event
 * @param {Function} setPendingModels - State setter for pending models
 * @param {Function} setModelValidationErrors - State setter for validation errors
 */
export function handleModelChange(e, setPendingModels, setModelValidationErrors) {
    const { errors, validFiles } = validateModelFiles(e.target.files);

    setModelValidationErrors(errors);

    if (validFiles.length > 0) {
        setPendingModels(prev => [...prev, ...validFiles]);
    }

    if (errors.length > 0 && e.target) {
        e.target.value = '';
    }
}

/**
 * Handles model file drag and drop
 * @param {FileList} fileList - Dropped files
 * @param {Function} setPendingModels - State setter for pending models
 * @param {Function} setModelValidationErrors - State setter for validation errors
 */
export function handleModelDrop(fileList, setPendingModels, setModelValidationErrors) {
    const { errors, validFiles } = validateModelFiles(fileList);
    setModelValidationErrors(errors);
    if (validFiles.length > 0) {
        setPendingModels(prev => [...prev, ...validFiles]);
    }
    if (errors.length > 0) {
        setTimeout(() => {
            setModelValidationErrors([]);
        }, 5000);
    }
}

/**
 * Handles removing a model from the form
 * @param {number} idx - Index of model to remove
 * @param {Object} form - Current form state
 * @param {Function} setForm - Form state setter
 * @param {Array} pendingModels - Array of pending model files
 * @param {Function} setPendingModels - State setter for pending models
 * @param {Object} modelInputRef - Ref to file input element
 * @param {Function} setModelValidationErrors - State setter for validation errors
 */
export function handleRemoveModel(idx, form, setForm, pendingModels, setPendingModels, modelInputRef, setModelValidationErrors) {
    if (idx < (form.paidAssets?.length || 0)) {
        setForm(f => ({
            ...f,
            paidAssets: f.paidAssets.filter((_, i) => i !== idx)
        }));
    } else {
        setPendingModels(pendingModels => pendingModels.filter((_, i) => i !== (idx - (form.paidAssets?.length || 0))));
    }
    if (modelInputRef.current) {
        modelInputRef.current.value = "";
    }
    setModelValidationErrors([]);
}

/**
 * Handles viewable model file input change
 * @param {Event} e - Input change event
 * @param {Function} setPendingViewableModel - State setter for pending viewable model
 * @param {Function} setViewableValidationErrors - State setter for validation errors
 */
export function handleViewableModelChange(e, setPendingViewableModel, setViewableValidationErrors) {
    const { errors, validFile } = validateViewableModel(e.target.files[0]);

    setViewableValidationErrors(errors);

    if (validFile) {
        setPendingViewableModel(validFile);
    }

    if (errors.length > 0 && e.target) {
        e.target.value = '';
    }
}

/**
 * Handles removing the viewable model from the form
 * @param {File|null} pendingViewableModel - Current pending viewable model
 * @param {Function} setPendingViewableModel - State setter for pending viewable model
 * @param {Function} setForm - Form state setter
 * @param {Object} viewableModelInputRef - Ref to file input element
 * @param {Function} setViewableValidationErrors - State setter for validation errors
 */
export function handleRemoveViewableModel(pendingViewableModel, setPendingViewableModel, setForm, viewableModelInputRef, setViewableValidationErrors) {
    if (pendingViewableModel) {
        setPendingViewableModel(null);
    } else {
        setForm(f => ({
            ...f,
            viewableModel: ""
        }));
    }

    if (viewableModelInputRef.current) {
        viewableModelInputRef.current.value = "";
    }
    setViewableValidationErrors([]);
}
