import React, { useCallback, useMemo } from 'react'
import { RxCross1 } from 'react-icons/rx'

export default function ViewableModelField({
    viewableValidationErrors,
    dragViewableModelActive,
    setDragViewableModelActive,
    viewableModelInputRef,
    pendingViewableModel,
    handleViewableModelChange,
    handleRemoveViewableModel,
    form
}) {
    const MAX_SIZE = 50 * 1024 * 1024 // 50MB for viewable models

    const hasSetter = useMemo(
        () => Array.isArray(viewableValidationErrors) && typeof viewableValidationErrors.setErrors === 'function',
        [viewableValidationErrors]
    )

    const setErrors = useCallback(
        (errors) => {
            if (hasSetter) {
                viewableValidationErrors.setErrors(errors)
            }
        },
        [hasSetter, viewableValidationErrors]
    )

    const validateFiles = useCallback(
        (fileList) => {
            const errors = []
            const files = fileList ? Array.from(fileList) : []

            files.forEach((file) => {
                if (file.size > MAX_SIZE) {
                    errors.push(
                        `Viewable model "${file.name}" is too large. Maximum size is ${Math.round(
                            MAX_SIZE / (1024 * 1024),
                        )}MB.`,
                    )
                }
            })

            return { files, errors }
        },
        [MAX_SIZE]
    )

    const handleChangeWithValidation = useCallback(
        (e) => {
            const { files, errors } = validateFiles(e.target.files)

            setErrors(errors)

            if (errors.length === 0 && files.length > 0) {
                handleViewableModelChange({ target: { files } })
            }
        },
        [handleViewableModelChange, setErrors, validateFiles]
    )
    return (
        <div className='flex flex-col gap-2 w-full'>
            <label className="formLabel">Viewable Model</label>
            {viewableValidationErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <div className="text-sm text-red-800 font-medium mb-1">Viewable Model Errors:</div>
                    <ul className="text-xs text-red-700 space-y-1">
                        {viewableValidationErrors.map((error, index) => (
                            <li key={index}>• {error}</li>
                        ))}
                    </ul>
                </div>
            )}
            <div
                className={`formDrag ${dragViewableModelActive ? "bg-borderColor/30" : ""}`
                }
                onClick={() => viewableModelInputRef.current && viewableModelInputRef.current.click()}
                onDragOver={e => {
                    e.preventDefault();
                    setDragViewableModelActive(true);
                }}
                onDragLeave={e => {
                    e.preventDefault();
                    setDragViewableModelActive(false);
                }}
                onDrop={e => {
                    e.preventDefault();
                    setDragViewableModelActive(false);
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        const { files, errors } = validateFiles(e.dataTransfer.files)
                        setErrors(errors)
                        if (errors.length === 0 && files.length > 0) {
                            handleViewableModelChange({ target: { files } })
                        }
                    }
                }}
            >
                Click to choose files or drag and drop here
                <input
                    type="file"
                    accept=".glb,.gltf"
                    multiple
                    onChange={handleChangeWithValidation}
                    style={{ display: "none" }}
                    ref={viewableModelInputRef}
                />
            </div>
            <ul className="flex flex-col text-sm w-fit">
                {pendingViewableModel ? (
                    <div className='gap-4 flex flex-row items-center justify-between'>
                        <li className='flex truncate' title={pendingViewableModel.name}>
                            <span className="underline">{pendingViewableModel.name}</span>
                        </li>
                        <RxCross1
                            className='flex cursor-pointer'
                            onClick={handleRemoveViewableModel}
                            size={12}
                        />
                    </div>
                ) : form.viewableModel ? (
                    <div className='gap-4 flex flex-row items-center justify-between'>
                        <li className='flex truncate' title={form.viewableModel}>
                            <a
                                href={`/api/proxy?key=${encodeURIComponent(form.viewableModel)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline"
                                download
                            >
                                {form.viewableModel.replace(/^models\//, "")}
                            </a>
                        </li>
                        <RxCross1
                            className='flex cursor-pointer'
                            onClick={handleRemoveViewableModel}
                            size={12}
                        />
                    </div>
                ) : null}
            </ul>
        </div>
    )
}
