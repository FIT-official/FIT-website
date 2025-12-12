'use client'
import { useState, useEffect, useRef } from 'react'
import { FiCheck, FiAlertCircle } from 'react-icons/fi'

export default function CategoryInput({
    label,
    value,
    onChange,
    placeholder,
    helpText,
    type = 'category',
    productType = null,
}) {
    const [inputValue, setInputValue] = useState(value || '')
    const [isValidating, setIsValidating] = useState(false)
    const [isValid, setIsValid] = useState(null)
    const [suggestions, setSuggestions] = useState([])
    const [showSuggestions, setShowSuggestions] = useState(false)
    const validationTimeoutRef = useRef(null)
    const dropdownRef = useRef(null)

    useEffect(() => {
        setInputValue(value || '')

        // Re-validate whenever the input value or the associated
        // productType changes. This ensures that a category which is
        // valid for print products but has no shop products will not
        // still show as valid after switching the featured product type
        // to "shop" (and vice versa).
        if (value) {
            validateCategory(value)
        } else {
            setIsValid(null)
        }
    }, [value, productType])

    const fetchCategories = async () => {
        try {
            const params = new URLSearchParams()
            if (productType) params.set('productType', productType)
            // Use a broad name search so the product API
            // allows the request without requiring a category
            // filter, while still returning real products.
            params.set('search', '.')
            params.set('limit', '100')

            const response = await fetch(`/api/product?${params.toString()}`)
            if (response.ok) {
                const data = await response.json()
                const categories = new Set()
                const subcategories = new Set()

                data.products?.forEach(product => {
                    const cat = product.categoryId || product.productCategory
                    const sub = product.subcategoryId || product.productSubCategory

                    if (cat) {
                        categories.add(cat)
                    }
                    if (sub) {
                        subcategories.add(sub)
                    }
                })

                return {
                    categories: Array.from(categories).sort(),
                    subcategories: Array.from(subcategories).sort()
                }
            }
        } catch (error) {
            console.error('Failed to fetch categories:', error)
        }
        return { categories: [], subcategories: [] }
    }

    const validateCategory = async (val) => {
        if (!val.trim()) {
            setIsValid(null)
            return
        }

        setIsValidating(true)
        try {
            const params = new URLSearchParams()
            if (productType) params.set('productType', productType)
            params.set(type === 'category' ? 'productCategory' : 'productSubCategory', val)
            params.set('limit', '1')

            const response = await fetch(`/api/product?${params.toString()}`)

            if (response.ok) {
                const data = await response.json()
                setIsValid(data.products && data.products.length > 0)
            } else {
                setIsValid(false)
            }
        } catch (error) {
            console.error('Validation failed:', error)
            setIsValid(false)
        } finally {
            setIsValidating(false)
        }
    }

    const handleInputChange = (e) => {
        const val = e.target.value
        setInputValue(val)
        onChange(val)
        setIsValid(null)

        // Debounce validation
        if (validationTimeoutRef.current) {
            clearTimeout(validationTimeoutRef.current)
        }

        if (val.trim()) {
            validationTimeoutRef.current = setTimeout(() => {
                validateCategory(val)
            }, 500)
        }
    }

    const handleFocus = async () => {
        const data = await fetchCategories()
        const list = type === 'category' ? data.categories : data.subcategories
        setSuggestions(list)
        setShowSuggestions(true)
    }

    const selectSuggestion = (suggestion) => {
        setInputValue(suggestion)
        onChange(suggestion)
        setShowSuggestions(false)
        validateCategory(suggestion)
    }

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowSuggestions(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const filteredSuggestions = suggestions.filter(s =>
        s.toLowerCase().includes(inputValue.toLowerCase())
    )

    return (
        <div className="space-y-2">
            <label className="formLabel">{label}</label>

            {helpText && (
                <p className="text-xs text-lightColor">{helpText}</p>
            )}

            <div className="relative" ref={dropdownRef}>
                <div className="relative">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={handleInputChange}
                        onFocus={handleFocus}
                        placeholder={placeholder}
                        className={`formInput pr-10 ${isValid === true ? 'border-green-500 focus:border-green-500' :
                            isValid === false ? 'border-red-500 focus:border-red-500' : ''
                            }`}
                    />

                    {/* Validation indicator */}
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {isValidating ? (
                            <div className="loader" style={{ width: '16px', height: '16px' }} />
                        ) : isValid === true ? (
                            <FiCheck className="text-green-600" size={18} />
                        ) : isValid === false ? (
                            <FiAlertCircle className="text-red-600" size={18} />
                        ) : null}
                    </div>
                </div>

                {/* Validation message */}
                {isValid === false && inputValue.trim() && (
                    <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                        <FiAlertCircle size={12} />
                        No products found with this {type}. Check spelling or create products with this {type} first.
                    </p>
                )}

                {isValid === true && (
                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                        <FiCheck size={12} />
                        Valid {type} - products found
                    </p>
                )}

                {/* Suggestions Dropdown */}
                {showSuggestions && filteredSuggestions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-borderColor rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        <div className="py-1">
                            {filteredSuggestions.map((suggestion, index) => (
                                <button
                                    key={index}
                                    type="button"
                                    onClick={() => selectSuggestion(suggestion)}
                                    className="w-full px-4 py-2 text-left text-sm hover:bg-baseColor transition-colors text-textColor"
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
