import React from 'react'
import { DashSelect } from './dashFormUi'

// Keep a stored classification visible even when it is no longer offered for
// new products. Never infer a material from the product name or choose another
// category's first option just to make an existing product editable.
function optionsWithCurrent(options = [], current) {
    const choices = options.map(option => ({ value: option.displayName, label: option.displayName }))
    if (current && !choices.some(option => option.value === current)) {
        choices.push({ value: current, label: `${current} (current)` })
    }
    return choices
}

export default function ProductTypeCategory({ form, setForm, isAdmin, categories, subcategories, originalProduct = null }) {
    const sameType = !!originalProduct && form.productType === originalProduct.productType
    const sameCategory = sameType && (form.categoryId || '') === (originalProduct.categoryId || '')
    const keepBlankCategory = sameType && !originalProduct.categoryId
    const keepBlankSubcategory = sameCategory && !originalProduct.subcategoryId

    return (
        <>
            <DashSelect
                onChangeFunction={e => {
                    const val = e.target.value;
                    if (val === "shop" && !isAdmin) return;
                    setForm(f => ({ ...f, productType: val, categoryId: "", subcategoryId: "" }));
                }}
                value={form.productType}
                name="productType"
                label="Product Type"
                options={[
                    { value: "print", label: "Print" },
                    ...(isAdmin ? [{ value: "shop", label: "Shop" }] : [])
                ]}
            />

            <DashSelect
                onChangeFunction={e => setForm(f => ({ ...f, categoryId: e.target.value, subcategoryId: "" }))}
                value={form.categoryId || ""}
                name="category"
                label="Category"
                required={!keepBlankCategory}
                options={[
                    { value: "", label: keepBlankCategory ? "No category (keep existing)" : "Select a category" },
                    ...optionsWithCurrent(categories, sameType ? originalProduct.categoryId : null)
                ]}
            />

            <DashSelect
                onChangeFunction={e => setForm(f => ({ ...f, subcategoryId: e.target.value }))}
                value={form.subcategoryId || ""}
                name="subcategory"
                label="Subcategory"
                required={!keepBlankSubcategory}
                options={[
                    { value: "", label: keepBlankSubcategory ? "No subcategory (keep existing)" : "Select a subcategory" },
                    ...optionsWithCurrent(subcategories, sameCategory ? originalProduct.subcategoryId : null)
                ]}
            />
        </>
    )
}
