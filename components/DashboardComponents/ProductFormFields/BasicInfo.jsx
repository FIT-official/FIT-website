import React from 'react'

export default function BasicInfo({ form, handleChange }) {
    return (
        <>
            {/* product name */}
            <div className="flex flex-col gap-2 w-full">
                <label htmlFor="name" className="formLabel">Product Name</label>
                <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    value={form.name}
                    onChange={handleChange}
                    className="formInput"
                    placeholder="Enter product name"
                />
            </div>

            {/* product desc */}
            <div className="flex flex-col gap-2  w-full">
                <label className="formLabel">Product Description</label>
                <textarea
                    id="description"
                    name="description"
                    rows={4}
                    maxLength={1000}
                    required
                    value={form.description}
                    onChange={handleChange}
                    className="formInput"
                    placeholder="Enter product description"
                    wrap="hard"
                />
            </div>
        </>
    )
}
