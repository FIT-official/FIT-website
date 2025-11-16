import React from 'react'
import ImageDrop from '@/components/General/ImageDrop'

export default function ImagesField({
    form,
    imageValidationErrors,
    imageInputRef,
    handleImageChange,
    handleImageDrop,
    handleRemoveImage,
    pendingImages
}) {
    return (
        <div className="flex flex-col gap-2 w-full">
            {imageValidationErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-2">
                    <div className="text-xs text-red-700 space-y-1">
                        {imageValidationErrors.map((error, index) => (
                            <div key={index}> {error}</div>
                        ))}
                    </div>
                </div>
            )}

            <ImageDrop
                label="Product Images"
                value={form.images}
                pendingFiles={pendingImages}
                multiple={true}
                maxFiles={7}
                onFilesSelected={(files) => {
                    // prefer the existing handlers from ProductForm
                    if (typeof handleImageDrop === 'function') handleImageDrop(files)
                    else if (typeof handleImageChange === 'function') {
                        // create synthetic event-like object for backward compatibility
                        handleImageChange({ target: { files } })
                    }
                }}
                onRemove={handleRemoveImage}
                inputRef={imageInputRef}
            />
        </div>
    )
}
