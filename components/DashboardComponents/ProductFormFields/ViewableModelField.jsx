import React from 'react'
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
                        handleViewableModelChange({ target: { files: e.dataTransfer.files } });
                    }
                }}
            >
                Click to choose files or drag and drop here
                <input
                    type="file"
                    accept=".glb,.gltf"
                    multiple
                    onChange={handleViewableModelChange}
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
