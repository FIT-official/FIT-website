import React from 'react'
import { RxCross1 } from 'react-icons/rx'

export default function PaidAssetsField({
    form,
    modelValidationErrors,
    dragActive,
    setDragActive,
    modelInputRef,
    handleModelChange,
    handleModelDrop,
    handleRemoveModel,
    pendingModels
}) {
    return (
        <div className='flex flex-col gap-2 w-full'>
            <label className="formLabel">Paid Assets (3D Models)</label>
            {modelValidationErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <div className="text-sm text-red-800 font-medium mb-1">Model Upload Errors:</div>
                    <ul className="text-xs text-red-700 space-y-1">
                        {modelValidationErrors.map((error, index) => (
                            <li key={index}>• {error}</li>
                        ))}
                    </ul>
                </div>
            )}
            <div
                className={`formDrag ${dragActive ? "bg-borderColor/30" : ""}`
                }
                onClick={() => modelInputRef.current && modelInputRef.current.click()}
                onDragOver={e => {
                    e.preventDefault();
                    setDragActive(true);
                }}
                onDragLeave={e => {
                    e.preventDefault();
                    setDragActive(false);
                }}
                onDrop={e => {
                    e.preventDefault();
                    setDragActive(false);
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        if (typeof handleModelDrop === 'function') {
                            handleModelDrop(e.dataTransfer.files);
                        }
                    }
                }}
            >
                Click to choose files or drag and drop here
                <input
                    type="file"
                    accept=".obj,.glb,.gltf,.stl,.blend,.fbx,.zip,.rar,.7z"
                    multiple
                    onChange={handleModelChange}
                    style={{ display: "none" }}
                    ref={modelInputRef}
                />
            </div>
            <ul className="flex flex-col text-sm w-fit">
                {[...(form.paidAssets || []), ...pendingModels].map((item, idx) => {
                    const isPending = idx >= (form.paidAssets?.length || 0);
                    return (
                        <div className='gap-4 flex flex-row items-center justify-between' key={idx}>
                            <li className='flex truncate' title={isPending ? item.name : item}>
                                {isPending ? (
                                    <span className="underline">{item.name}</span>
                                ) : (
                                    <a
                                        href={`/api/proxy?key=${encodeURIComponent(item)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline"
                                        download
                                    >
                                        {item.replace(/^models\//, "")}
                                    </a>
                                )}
                            </li>
                            <RxCross1
                                className='flex cursor-pointer'
                                onClick={() => handleRemoveModel(idx)}
                                size={12}
                            />
                        </div>
                    );
                })}
            </ul>
        </div>
    )
}
