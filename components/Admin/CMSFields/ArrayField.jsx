'use client'
import { useState } from 'react'
import { FaPlus, FaTrash, FaChevronDown, FaChevronUp } from 'react-icons/fa'
import TextInput from './TextInput'
import ImageUpload from './ImageUpload'
import SelectField from './SelectField'

export default function ArrayField({ label, value = [], onChange, fieldMeta = {} }) {
    const [expandedIndexes, setExpandedIndexes] = useState([0])

    const items = Array.isArray(value) ? value : []
    const fields = fieldMeta?.fields || {}

    const addItem = () => {
        const newItem = {}
        Object.keys(fields).forEach(key => {
            newItem[key] = fields[key].type === 'array' ? [] : ''
        })
        onChange([...items, newItem])
        setExpandedIndexes([...expandedIndexes, items.length])
    }

    const removeItem = (index) => {
        onChange(items.filter((_, i) => i !== index))
        setExpandedIndexes(expandedIndexes.filter(i => i !== index))
    }

    const updateItem = (index, field, newValue) => {
        const newItems = [...items]
        newItems[index] = {
            ...newItems[index],
            [field]: newValue
        }
        onChange(newItems)
    }

    const toggleExpanded = (index) => {
        if (expandedIndexes.includes(index)) {
            setExpandedIndexes(expandedIndexes.filter(i => i !== index))
        } else {
            setExpandedIndexes([...expandedIndexes, index])
        }
    }

    const moveItem = (index, direction) => {
        const newIndex = direction === 'up' ? index - 1 : index + 1
        if (newIndex < 0 || newIndex >= items.length) return

        const newItems = [...items]
        const temp = newItems[index]
        newItems[index] = newItems[newIndex]
        newItems[newIndex] = temp
        onChange(newItems)
    }

    const renderField = (item, itemIndex, fieldKey, fieldConfig) => {
        const value = item[fieldKey] || ''
        const onChange = (newValue) => updateItem(itemIndex, fieldKey, newValue)

        const fieldLabel = fieldKey.charAt(0).toUpperCase() + fieldKey.slice(1).replace(/([A-Z])/g, ' $1')

        if (fieldConfig.type === 'image') {
            return (
                <ImageUpload
                    key={fieldKey}
                    label={fieldLabel}
                    value={value}
                    onChange={onChange}
                    uploadPath={fieldConfig.uploadPath || 'general'}
                    uploadEndpoint={fieldConfig.uploadEndpoint || '/api/admin/upload/images'}
                    cropAspectRatio={fieldConfig.aspectRatio}
                    targetWidth={fieldConfig.width}
                    targetHeight={fieldConfig.height}
                    resetValue={fieldConfig.resetValue}
                />
            )
        }

        if (fieldConfig.type === 'select') {
            return (
                <SelectField
                    key={fieldKey}
                    label={fieldLabel}
                    value={value}
                    onChange={onChange}
                    options={fieldConfig.options || []}
                />
            )
        }

        if (fieldConfig.type === 'textarea') {
            return (
                <TextInput
                    key={fieldKey}
                    label={fieldLabel}
                    value={value}
                    onChange={onChange}
                    rows={3}
                />
            )
        }

        return (
            <TextInput
                key={fieldKey}
                label={fieldLabel}
                value={value}
                onChange={onChange}
            />
        )
    }

    const getItemPreview = (item) => {
        const titleField = Object.keys(fields).find(k =>
            k.toLowerCase().includes('name') ||
            k.toLowerCase().includes('title')
        )
        if (titleField && item[titleField]) {
            return item[titleField]
        }
        return 'Item'
    }

    return (
        <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                {label}
            </label>

            <div className="flex flex-col gap-3">
                {items.map((item, index) => {
                    const isExpanded = expandedIndexes.includes(index)
                    return (
                        <div
                            key={index}
                            className="border border-borderColor rounded-lg bg-white overflow-hidden"
                        >
                            <div className="flex items-center justify-between p-3 bg-borderColor/30 border-b border-borderColor">
                                <button
                                    type="button"
                                    onClick={() => toggleExpanded(index)}
                                    className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-textColor transition-colors"
                                >
                                    {isExpanded ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
                                    <span>{getItemPreview(item)} #{index + 1}</span>
                                </button>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => moveItem(index, 'up')}
                                        disabled={index === 0}
                                        className="p-1.5 text-xs text-gray-600 hover:text-textColor disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                        title="Move up"
                                    >
                                        ↑
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => moveItem(index, 'down')}
                                        disabled={index === items.length - 1}
                                        className="p-1.5 text-xs text-gray-600 hover:text-textColor disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                        title="Move down"
                                    >
                                        ↓
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => removeItem(index)}
                                        className="p-1.5 text-red-600 hover:text-red-700 transition-colors"
                                        title="Remove"
                                    >
                                        <FaTrash size={12} />
                                    </button>
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="p-4 flex flex-col gap-4">
                                    {Object.keys(fields).map(fieldKey => {
                                        const fieldConfig = fields[fieldKey]
                                        return renderField(item, index, fieldKey, fieldConfig)
                                    })}
                                </div>
                            )}
                        </div>
                    )
                })}

                <button
                    type="button"
                    onClick={addItem}
                    className="flex items-center justify-center gap-2 p-3 border border-dashed border-borderColor rounded-lg hover:border-textColor/20 hover:bg-borderColor/20 transition-colors text-sm font-medium text-gray-600 cursor-pointer hover:text-textColor"
                >
                    <FaPlus size={12} />
                    Add {label}
                </button>
            </div>
        </div>
    )
}
