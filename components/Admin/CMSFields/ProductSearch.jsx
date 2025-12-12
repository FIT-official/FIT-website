'use client'
import { useState, useEffect, useRef } from 'react'
import { FiSearch, FiX, FiCheck } from 'react-icons/fi'
import { MdDragIndicator } from 'react-icons/md'

export default function ProductSearch({ label, value, onChange, helpText }) {
    const [searchQuery, setSearchQuery] = useState('')
    const [searchResults, setSearchResults] = useState([])
    const [isSearching, setIsSearching] = useState(false)
    const [showDropdown, setShowDropdown] = useState(false)
    const [selectedProducts, setSelectedProducts] = useState([])
    const [draggedIndex, setDraggedIndex] = useState(null)
    const searchTimeoutRef = useRef(null)
    const dropdownRef = useRef(null)

    // Parse initial value (comma-separated product IDs)
    useEffect(() => {
        if (value && typeof value === 'string') {
            const ids = value.split(',').map(id => id.trim()).filter(Boolean)
            if (ids.length > 0) {
                fetchProductsByIds(ids)
            }
        }
    }, [])

    const fetchProductsByIds = async (ids) => {
        try {
            const products = []
            for (const id of ids) {
                const response = await fetch(`/api/product/${id}`)
                if (response.ok) {
                    const product = await response.json()
                    products.push(product)
                }
            }
            setSelectedProducts(products)
        } catch (error) {
            console.error('Failed to fetch products:', error)
        }
    }

    const searchProducts = async (query) => {
        if (!query.trim()) {
            setSearchResults([])
            return
        }

        setIsSearching(true)
        try {
            const response = await fetch(`/api/product?search=${encodeURIComponent(query)}&limit=10`)
            if (response.ok) {
                const data = await response.json()
                setSearchResults(data.products || [])
            }
        } catch (error) {
            console.error('Search failed:', error)
            setSearchResults([])
        } finally {
            setIsSearching(false)
        }
    }

    const handleSearchChange = (e) => {
        const query = e.target.value
        setSearchQuery(query)
        setShowDropdown(true)

        // Debounce search
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current)
        }

        searchTimeoutRef.current = setTimeout(() => {
            searchProducts(query)
        }, 300)
    }

    const addProduct = (product) => {
        if (!selectedProducts.find(p => p._id === product._id)) {
            const updated = [...selectedProducts, product]
            setSelectedProducts(updated)
            updateValue(updated)
        }
        setSearchQuery('')
        setShowDropdown(false)
        setSearchResults([])
    }

    const removeProduct = (productId) => {
        const updated = selectedProducts.filter(p => p._id !== productId)
        setSelectedProducts(updated)
        updateValue(updated)
    }

    const updateValue = (products) => {
        const ids = products.map(p => p._id).join(', ')
        onChange(ids)
    }

    const handleDragStart = (index) => {
        setDraggedIndex(index)
    }

    const handleDragOver = (e, index) => {
        e.preventDefault()
        if (draggedIndex === null || draggedIndex === index) return

        const updated = [...selectedProducts]
        const draggedItem = updated[draggedIndex]
        updated.splice(draggedIndex, 1)
        updated.splice(index, 0, draggedItem)

        setSelectedProducts(updated)
        setDraggedIndex(index)
        updateValue(updated)
    }

    const handleDragEnd = () => {
        setDraggedIndex(null)
    }

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowDropdown(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    return (
        <div className="space-y-3">
            <label className="formLabel">{label}</label>

            {helpText && (
                <p className="text-xs text-lightColor">{helpText}</p>
            )}

            <div className="relative" ref={dropdownRef}>
                <div className="relative">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={handleSearchChange}
                        onFocus={() => setShowDropdown(true)}
                        placeholder="Search products by name..."
                        className="formInput pl-10"
                    />
                    <FiSearch className="absolute right-3 top-1/2 -translate-y-1/2 text-borderColor" size={18} />
                </div>

                {showDropdown && (searchQuery.trim() || isSearching) && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-borderColor rounded-lg shadow-lg max-h-64 overflow-y-auto">
                        {isSearching ? (
                            <div className="p-4 text-center text-sm text-lightColor">
                                <div className="loader mx-auto mb-2" style={{ width: '20px', height: '20px' }} />
                                Searching...
                            </div>
                        ) : searchResults.length > 0 ? (
                            <div className="py-1">
                                {searchResults.map(product => (
                                    <button
                                        key={product._id}
                                        type="button"
                                        onClick={() => addProduct(product)}
                                        disabled={selectedProducts.find(p => p._id === product._id)}
                                        className="w-full px-4 py-2 text-left hover:bg-baseColor transition-colors flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {product.images?.[0] && (
                                            <img
                                                src={`/api/proxy?key=${encodeURIComponent(product.images[0])}`}
                                                alt={product.name}
                                                className="w-10 h-10 object-cover rounded border border-borderColor"
                                            />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-textColor truncate">
                                                {product.name}
                                            </div>
                                            <div className="text-xs text-lightColor">
                                                {product.productCategory || 'Uncategorized'}
                                            </div>
                                        </div>
                                        {selectedProducts.find(p => p._id === product._id) && (
                                            <FiCheck className="text-green-600 flex-shrink-0" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        ) : searchQuery.trim() ? (
                            <div className="p-4 text-center text-sm text-lightColor">
                                No products found
                            </div>
                        ) : null}
                    </div>
                )}
            </div>

            {/* Selected Products */}
            {selectedProducts.length > 0 && (
                <div className="space-y-2">
                    <div className="text-xs font-medium text-textColor">
                        Selected Products ({selectedProducts.length}) - Drag to reorder
                    </div>
                    <div className="space-y-2">
                        {selectedProducts.map((product, index) => (
                            <div
                                key={product._id}
                                draggable
                                onDragStart={() => handleDragStart(index)}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDragEnd={handleDragEnd}
                                className={`flex items-center gap-3 p-3 bg-baseColor border border-borderColor rounded-lg cursor-move hover:border-textColor/30 transition-all ${draggedIndex === index ? 'opacity-50' : ''
                                    }`}
                            >
                                <MdDragIndicator className="text-lightColor flex-shrink-0" size={20} />

                                {product.images?.[0] && (
                                    <img
                                        src={`/api/proxy?key=${encodeURIComponent(product.images[0])}`}
                                        alt={product.name}
                                        className="w-12 h-12 object-cover rounded border border-borderColor"
                                    />
                                )}

                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-textColor truncate">
                                        {product.name}
                                    </div>
                                    <div className="text-xs text-lightColor">
                                        {product.productCategory || 'Uncategorized'}
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => removeProduct(product._id)}
                                    className="flex-shrink-0 p-1.5 hover:bg-red-50 rounded-full transition-colors group"
                                    title="Remove product"
                                >
                                    <FiX className="text-lightColor group-hover:text-red-600" size={18} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
