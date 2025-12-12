'use client'
import { useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link";
import { GoChevronDown, GoChevronLeft, GoChevronRight } from "react-icons/go";
import { supportedCountries } from '@/lib/supportedCountries'
import { useToast } from "../General/ToastProvider";
import { uploadImages, uploadModels, uploadViewable } from "@/utils/uploadHelpers";
import useAccess from "@/utils/useAccess";
import BasicInfo from './ProductFormFields/BasicInfo';
import ImagesField from './ProductFormFields/ImagesField';
import ProductTypeCategory from './ProductFormFields/ProductTypeCategory';
import ViewableModelField from './ProductFormFields/ViewableModelField';
import PaidAssetsField from './ProductFormFields/PaidAssetsField';
import ShippingFields from './ProductFormFields/ShippingFields';
import PricingFields from './ProductFormFields/PricingFields';
import VariantTypesField from './ProductFormFields/VariantTypesField';
import DiscountsField from './ProductFormFields/DiscountsField';
import {
    mapProductToForm,
    buildProductPayload,
    cleanupUploadedFiles,
    handleImageChange as handleImageChangeHelper,
    handleImageDrop as handleImageDropHelper,
    handleRemoveImage as handleRemoveImageHelper,
    handleModelChange as handleModelChangeHelper,
    handleModelDrop as handleModelDropHelper,
    handleRemoveModel as handleRemoveModelHelper,
    handleViewableModelChange as handleViewableModelChangeHelper,
    handleRemoveViewableModel as handleRemoveViewableModelHelper,
} from '@/utils/formHelpers';

function ProductForm({ mode = "Create", product = null }) {
    const { user, isLoaded } = useUser()
    const [events, setEvents] = useState([])
    const formattedMode = mode
        .trim()
        .toLowerCase()
        .replace(/^([a-z])/, (m) => m.toUpperCase())
    const allCurrencies = supportedCountries.reduce((acc, country) => {
        if (country.currency && !acc.includes(country.currency)) {
            acc.push(country.currency);
        }
        return acc;
    }, []);
    const { showToast } = useToast();
    const { isAdmin } = useAccess();


    const imageInputRef = useRef(null);
    const modelInputRef = useRef(null);
    const viewableModelInputRef = useRef(null);
    
    // Refs for scrolling to sections with errors
    const detailsSectionRef = useRef(null);
    const shippingSectionRef = useRef(null);
    const pricingSectionRef = useRef(null);
    const [pendingImages, setPendingImages] = useState([]);
    const [pendingModels, setPendingModels] = useState([]);
    const [pendingViewableModel, setPendingViewableModel] = useState(null);
    const [dragActive, setDragActive] = useState(false);
    const [dragImagesActive, setDragImagesActive] = useState(false);
    const [dragViewableModelActive, setDragViewableModelActive] = useState(false);

    const [isLoading, setIsLoading] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const [openSection, setOpenSection] = useState({
        details: true,
        shipping: false,
        pricing: false,
    });

    const defaultForm = {
        name: "",
        description: "",
        images: [],
        viewableModel: "", // v1.1 feature
        paidAssets: [], // change from paidAssets
        productType: "shop",
        category: 0,
        subcategory: 0,
        categoryId: "",
        subcategoryId: "",
        stock: 1,

        basePrice: {
            presentmentAmount: 0,
            presentmentCurrency: "SGD",
        },
        priceCredits: 0,

        variantTypes: [],

        variants: [],
        variantInput: "",
        variantForm: {
            name: "",
            presentmentAmount: 0,
            presentmentCurrency: "SGD",
            priceCredits: "",
            stock: 1,
        },
        delivery: {
            deliveryTypes: []
        },
        dimensions: {
            length: 0,
            width: 0,
            height: 0,
            weight: 0,
        },
        showDiscount: false,
        discount: {
            eventId: "",
            percentage: "",
            minimumPrice: "",
            startDate: "",
            endDate: "",
        },
    };

    const [form, setForm] = useState(product ? { ...defaultForm, ...product } : defaultForm);

    // If not admin, force productType to 'print' and reset category/subcategory if needed
    useEffect(() => {
        if (!isAdmin && form.productType !== "print") {
            setForm(f => ({
                ...f,
                productType: "print",
                category: 0,
                subcategory: 0
            }));
        }
    }, [isAdmin]);

    // Fetch admin-configurable options
    useEffect(() => {
        const fetchAdminConfig = async () => {
            try {
                // Fetch delivery types and categories from AppSettings
                const settingsRes = await fetch('/api/admin/settings');
                if (settingsRes.ok) {
                    const settingsData = await settingsRes.json();

                    // Handle delivery types
                    const applicableDeliveryTypes = (settingsData.deliveryTypes || []).filter(dt =>
                        dt.isActive && dt.applicableToProductTypes?.includes(form.productType)
                    );
                    setAdminDeliveryTypes(applicableDeliveryTypes);

                    // Handle categories - filter by type and isActive
                    const activeCats = (settingsData.categories || [])
                        .filter(cat => cat.type === form.productType && cat.isActive);

                    setAdminCategories(activeCats);

                    // Extract active subcategories for the currently selected category
                    // We'll update this when category changes
                    if (activeCats.length > 0) {
                        const currentCat = activeCats.find(c => c.displayName === form.categoryId) || activeCats[0];
                        const activeSubs = (currentCat.subcategories || []).filter(sub => sub.isActive);
                        setAdminSubcategories(activeSubs);
                    } else {
                        setAdminSubcategories([]);
                    }
                } else {
                    // Fallback to legacy hardcoded categories
                    const hardcodedCategories = form.productType === "shop" ? SHOP_CATEGORIES : PRINT_CATEGORIES;
                    const hardcodedSubcategories = form.productType === "shop" ? SHOP_SUBCATEGORIES : PRINT_SUBCATEGORIES;

                    // Convert legacy format to new format
                    const legacyCats = hardcodedCategories.map((cat, idx) => ({
                        name: cat.toLowerCase().replace(/\s+/g, '-'),
                        displayName: cat,
                        type: form.productType,
                        isActive: true,
                        subcategories: hardcodedSubcategories[idx]?.map(sub => ({
                            name: sub.toLowerCase().replace(/\s+/g, '-'),
                            displayName: sub,
                            isActive: true
                        })) || []
                    }));

                    setAdminCategories(legacyCats);
                    if (legacyCats.length > 0) {
                        setAdminSubcategories(legacyCats[0].subcategories || []);
                    }
                }
            } catch (error) {
                console.error('Error fetching admin config:', error);
                const hardcodedCategories = form.productType === "shop" ? SHOP_CATEGORIES : PRINT_CATEGORIES;
                const hardcodedSubcategories = form.productType === "shop" ? SHOP_SUBCATEGORIES : PRINT_SUBCATEGORIES;

                const legacyCats = hardcodedCategories.map((cat, idx) => ({
                    name: cat.toLowerCase().replace(/\s+/g, '-'),
                    displayName: cat,
                    type: form.productType,
                    isActive: true,
                    subcategories: hardcodedSubcategories[idx]?.map(sub => ({
                        name: sub.toLowerCase().replace(/\s+/g, '-'),
                        displayName: sub,
                        isActive: true
                    })) || []
                }));

                setAdminCategories(legacyCats);
                if (legacyCats.length > 0) {
                    setAdminSubcategories(legacyCats[0].subcategories || []);
                }
            }
        };

        fetchAdminConfig();
    }, [form.productType]);

    // Admin-configurable options state
    const [adminCategories, setAdminCategories] = useState([]);
    const [adminSubcategories, setAdminSubcategories] = useState([]);
    const [adminDeliveryTypes, setAdminDeliveryTypes] = useState([]);

    useEffect(() => {
        if (adminCategories.length > 0 && form.categoryId) {
            const selectedCat = adminCategories.find(c => c.displayName === form.categoryId);
            if (selectedCat) {
                const activeSubs = (selectedCat.subcategories || []).filter(sub => sub.isActive);
                setAdminSubcategories(activeSubs);
            }
        }
    }, [form.categoryId, adminCategories]);


    const categories = adminCategories;
    const subcategories = adminSubcategories;

    useEffect(() => {
        if (product) {
            setForm(mapProductToForm(product, defaultForm));
        }
    }, [product]);

    const handleChange = e => {
        const { name, value, type, checked } = e.target;
        if (["length", "width", "height", "weight"].includes(name)) {
            setForm(f => ({
                ...f,
                dimensions: {
                    ...f.dimensions,
                    [name]: value
                }
            }));
        }
        else {
            setForm(f => ({
                ...f,
                [name]: type === "checkbox" ? checked : value
            }));
        }
    };

    // File upload handlers - wrapped to pass required state
    const [imageValidationErrors, setImageValidationErrors] = useState([]);
    const [modelValidationErrors, setModelValidationErrors] = useState([]);
    const [viewableValidationErrors, setViewableValidationErrors] = useState([]);
    const [missingFields, setMissingFields] = useState([]);

    const handleImageChange = useCallback(
        (e) => handleImageChangeHelper(e, setPendingImages, setImageValidationErrors),
        [],
    );
    const handleImageDrop = useCallback(
        (fileList) => handleImageDropHelper(fileList, setPendingImages, setImageValidationErrors),
        [],
    );
    const handleRemoveImage = useCallback(
        (idx) => handleRemoveImageHelper(idx, form, setForm, pendingImages, setPendingImages, imageInputRef, setImageValidationErrors),
        [form, pendingImages],
    );

    const handleModelChange = useCallback(
        (e) => handleModelChangeHelper(e, setPendingModels, setModelValidationErrors),
        [],
    );
    const handleModelDrop = useCallback(
        (fileList) => handleModelDropHelper(fileList, setPendingModels, setModelValidationErrors),
        [],
    );
    const handleRemoveModel = useCallback(
        (idx) => handleRemoveModelHelper(idx, form, setForm, pendingModels, setPendingModels, modelInputRef, setModelValidationErrors),
        [form, pendingModels],
    );

    const handleViewableModelChange = useCallback(
        (e) => handleViewableModelChangeHelper(e, setPendingViewableModel, setViewableValidationErrors),
        [],
    );
    const handleRemoveViewableModel = useCallback(
        () => handleRemoveViewableModelHelper(pendingViewableModel, setPendingViewableModel, setForm, viewableModelInputRef, setViewableValidationErrors),
        [pendingViewableModel],
    );

    // Submit handler
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isLoaded) return;

        // Clear previous validation errors
        setMissingFields([]);

        // Validate required fields (matching backend requirements)
        const totalImages = (form.images?.length || 0) + pendingImages.length;
        const requiredFieldsCheck = [];
        
        if (!form.name || form.name.trim() === '') requiredFieldsCheck.push('name');
        if (!form.description || form.description.trim() === '') requiredFieldsCheck.push('description');
        if (totalImages === 0) requiredFieldsCheck.push('images');
        if (!form.basePrice || form.basePrice.presentmentAmount === undefined) requiredFieldsCheck.push('basePrice');
        if (form.priceCredits === undefined || form.priceCredits === null) requiredFieldsCheck.push('priceCredits');
        if (!form.productType) requiredFieldsCheck.push('productType');
        const hasDeliveryTypes = Array.isArray(form.delivery?.deliveryTypes) && form.delivery.deliveryTypes.length > 0;
        if (!hasDeliveryTypes) requiredFieldsCheck.push('deliveryTypes');

        if (requiredFieldsCheck.length > 0) {
            setMissingFields(requiredFieldsCheck);

            // Ensure relevant sections are open
            setOpenSection(prev => ({
                ...prev,
                details: prev.details || requiredFieldsCheck.some(f => ['name', 'description', 'images', 'productType'].includes(f)),
                shipping: prev.shipping || requiredFieldsCheck.includes('deliveryTypes'),
                pricing: prev.pricing || requiredFieldsCheck.some(f => ['basePrice', 'priceCredits'].includes(f)),
            }));

            // Scroll to first missing field
            if (requiredFieldsCheck.some(f => ['name', 'description', 'images', 'productType'].includes(f))) {
                detailsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else if (requiredFieldsCheck.includes('deliveryTypes')) {
                shippingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else if (requiredFieldsCheck.some(f => ['basePrice', 'priceCredits'].includes(f))) {
                pricingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

            const fieldNames = requiredFieldsCheck.map(f => {
                switch(f) {
                    case 'name': return 'Product Name';
                    case 'description': return 'Description';
                    case 'images': return 'Product Images (at least 1)';
                    case 'basePrice': return 'Base Price';
                    case 'priceCredits': return 'Credit Price';
                    case 'productType': return 'Product Type';
                    case 'deliveryTypes': return 'Delivery Type';
                    default: return f;
                }
            }).join(', ');
            
            showToast(`Missing required fields: ${fieldNames}`, "error");
            return;
        }

        // Additional validation for invalid values (beyond just missing fields)
        const validationErrors = [];

        // Numeric validations
        const baseAmount = typeof form.basePrice?.presentmentAmount === 'number'
            ? form.basePrice.presentmentAmount
            : Number(form.basePrice?.presentmentAmount);
        if (!Number.isNaN(baseAmount) && baseAmount < 0) {
            validationErrors.push('Base price cannot be negative.');
        }

        const creditsAmount = typeof form.priceCredits === 'number'
            ? form.priceCredits
            : Number(form.priceCredits);
        if (!Number.isNaN(creditsAmount) && creditsAmount < 0) {
            validationErrors.push('Credit price cannot be negative.');
        }

        if (typeof form.stock === 'number' && form.stock < 0) {
            validationErrors.push('Stock cannot be negative.');
        }

        const dims = form.dimensions || {};
        if (
            (typeof dims.length === 'number' && dims.length < 0) ||
            (typeof dims.width === 'number' && dims.width < 0) ||
            (typeof dims.height === 'number' && dims.height < 0) ||
            (typeof dims.weight === 'number' && dims.weight < 0)
        ) {
            validationErrors.push('Dimensions must be zero or positive values.');
        }

        // Discount validations
        if (form.showDiscount) {
            const discount = form.discount || {};
            const hasEvent = !!discount.eventId;
            const percentage = Number(discount.percentage);
            const minimumPrice = Number(discount.minimumPrice);
            const startDate = discount.startDate ? new Date(discount.startDate) : null;
            const endDate = discount.endDate ? new Date(discount.endDate) : null;

            if (!hasEvent && (Number.isNaN(percentage) || percentage <= 0 || percentage > 100)) {
                validationErrors.push('Discount percentage must be between 1 and 100%.');
            }

            if (!hasEvent && !Number.isNaN(minimumPrice) && minimumPrice < 0) {
                validationErrors.push('Discount minimum amount cannot be negative.');
            }

            if (!hasEvent && startDate && endDate && startDate > endDate) {
                validationErrors.push('Discount start date must be before the end date.');
            }
        }

        // Delivery type validations
        const hasPaidAssets = (Array.isArray(form.paidAssets) && form.paidAssets.length > 0) || pendingModels.length > 0;
        const hasDigitalDelivery = form.delivery?.deliveryTypes?.some(dt => dt.type === 'digital' || dt === 'digital');

        if (!hasDeliveryTypes) {
            validationErrors.push('Select at least one delivery type.');
        }

        if (hasPaidAssets && !hasDigitalDelivery) {
            validationErrors.push('Products with downloadable files must include digital delivery.');
        }

        // If digital delivery is selected, enforce a single variant configuration
        if (hasDigitalDelivery) {
            if (form.variantTypes?.length > 1) {
                validationErrors.push('Digital products support only one variant type.');
            }
            if (form.variantTypes?.[0]?.options && form.variantTypes[0].options.length > 1) {
                validationErrors.push('Digital products support only one variant option.');
            }
        }

        if (validationErrors.length > 0) {
            // Open relevant sections and scroll to the first problem area
            setOpenSection(prev => ({
                ...prev,
                shipping: true,
                pricing: true,
            }));

            if (!hasDeliveryTypes || (hasPaidAssets && !hasDigitalDelivery)) {
                shippingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else if (validationErrors.some(msg => msg.toLowerCase().includes('price'))) {
                pricingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

            showToast(`Validation errors: ${validationErrors.join(' ')}`, 'error');
            return;
        }
        setIsLoading(true);
        let uploadedImages = []
        let uploadedModels = []
        let uploadedViewable = null
        let allUploadedFiles = [] // Track all files for cleanup

        try {
            // Upload images first
            uploadedImages = await uploadImages(pendingImages);
            allUploadedFiles.push(...uploadedImages);

            // Upload models
            uploadedModels = await uploadModels(pendingModels);
            allUploadedFiles.push(...uploadedModels);

            // Upload viewable model
            uploadedViewable = await uploadViewable(pendingViewableModel);
            if (uploadedViewable) {
                allUploadedFiles.push(uploadedViewable);
            }
        } catch (error) {
            console.error("Error uploading files:", error);

            // Cleanup any uploaded files
            if (allUploadedFiles.length > 0) {
                showToast("Upload failed. Cleaning up uploaded files...", "error");
                try {
                    await cleanupUploadedFiles(allUploadedFiles);
                } catch (cleanupError) {
                    console.error("Cleanup failed:", cleanupError);
                }
            }

            showToast(`Upload failed: ${error.message || 'Please check your files and try again.'}`, "error");
            setIsLoading(false);
            return;
        }

        const payload = buildProductPayload(form, user, uploadedImages, uploadedModels, uploadedViewable);

        const isEditing = !!(product && (product._id));
        const method = isEditing ? "PUT" : "POST";
        const url = isEditing
            ? `/api/product?productId=${product._id}`
            : "/api/product";

        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();

            if (!res.ok) {
                // Cleanup any uploaded files since the product save failed
                if (allUploadedFiles.length > 0) {
                    try {
                        await cleanupUploadedFiles(allUploadedFiles);
                    } catch (cleanupError) {
                        console.error("Cleanup after product save failed:", cleanupError);
                    }
                }

                // If backend reports missingFields, mirror that in the UI
                if (Array.isArray(data.missingFields) && data.missingFields.length > 0) {
                    setMissingFields(data.missingFields);

                    const missing = data.missingFields;

                    // Ensure the relevant sections are open
                    setOpenSection(prev => ({
                        ...prev,
                        details: prev.details || missing.some(f => ["name", "description", "images", "productType"].includes(f)),
                        pricing: prev.pricing || missing.some(f => ["basePrice", "priceCredits"].includes(f)),
                    }));

                    // Scroll to the most relevant section
                    if (missing.some(f => ["name", "description", "images", "productType"].includes(f))) {
                        detailsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    } else if (missing.some(f => ["basePrice", "priceCredits"].includes(f))) {
                        pricingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }

                    const fieldNames = missing.map(f => {
                        switch (f) {
                            case 'name': return 'Product Name';
                            case 'description': return 'Description';
                            case 'images': return 'Product Images (at least 1)';
                            case 'basePrice': return 'Base Price';
                            case 'priceCredits': return 'Credit Price';
                            case 'productType': return 'Product Type';
                            default: return f;
                        }
                    }).join(', ');

                    showToast(`Missing required fields: ${fieldNames}`, 'error');
                } else {
                    showToast(data.error || "Failed to create product", 'error');
                }

                setIsLoading(false);
                return;
            }

            // Success path
            setPendingImages([]);
            setPendingModels([]);
            setPendingViewableModel(null);
            setIsLoading(false);
            if (imageInputRef.current) imageInputRef.current.value = "";
            if (modelInputRef.current) modelInputRef.current.value = "";
            if (viewableModelInputRef.current) viewableModelInputRef.current.value = "";
            showToast(isEditing ? "Product updated successfully!" : "Product created successfully!", 'success');
            if (!isEditing) {
                setForm({ ...defaultForm });
            }
        } catch (err) {
            showToast("Network error: " + err.message, 'error');
            setIsLoading(false);
        }
    }

    // Auto-set digital delivery when paid assets (downloadable files) are present
    useEffect(() => {
        const hasPaidAssets = (Array.isArray(form.paidAssets) && form.paidAssets.length > 0) || pendingModels.length > 0;
        const hasDigital = form.delivery?.deliveryTypes?.some(dt => dt.type === 'digital' || dt === 'digital');

        // Add digital delivery when paid assets are added
        if (hasPaidAssets && !hasDigital) {
            // When switching to digital delivery, trim variants to max 1 type with 1 option
            const trimmedVariantTypes = form.variantTypes?.length > 0
                ? [{
                    ...form.variantTypes[0], // Keep first variant type
                    options: form.variantTypes[0].options?.length > 0
                        ? [form.variantTypes[0].options[0]] // Keep only first option
                        : []
                }]
                : [];

            setForm(prev => ({
                ...prev,
                delivery: {
                    ...(prev.delivery || {}),
                    deliveryTypes: [{ type: 'digital', price: 0, customDescription: 'Digital download only' }]
                },
                variantTypes: trimmedVariantTypes
            }));
        }
        
        // Remove digital delivery when all paid assets are removed
        if (!hasPaidAssets && hasDigital) {
            // Only remove digital if it was auto-added (i.e., it's the only delivery type)
            const onlyDigital = form.delivery?.deliveryTypes?.length === 1 && 
                               form.delivery?.deliveryTypes[0]?.type === 'digital';
            
            if (onlyDigital) {
                setForm(prev => ({
                    ...prev,
                    delivery: {
                        ...(prev.delivery || {}),
                        deliveryTypes: []
                    }
                }));
            }
        }
    }, [form.paidAssets, pendingModels]);


    const handleDelete = async () => {
        if (!window.confirm("Are you sure you want to delete this product?")) return;
        try {
            setDeleting(true);
            const res = await fetch(`/api/product?productId=${product._id}`, {
                method: "DELETE",
            });
            const data = await res.json();
            if (!res.ok) {
                showToast(data.error || "Failed to delete product", "error");
            } else {
                showToast("Product deleted successfully!", "success");
            }
        } catch (err) {
            showToast("Network error: " + err.message, "error");
        }
        setDeleting(false);
    }
    return (
        <form onSubmit={handleSubmit} className='flex flex-col w-full items-center justify-center gap-4'>
            <Link href='/dashboard/products' className='flex w-full items-center text-sm font-normal gap-2 toggleXbutton'>
                <GoChevronLeft /> Back to Products
            </Link>
            <h1 className="flex w-full mb-4">{formattedMode} Product</h1>

            <div ref={detailsSectionRef} className="flex flex-col w-full border border-borderColor rounded-sm">
                <button
                    type="button"
                    className="flex font-medium justify-between bg-borderColor/40 hover:bg-borderColor/70 w-full px-4 py-2 border-b border-borderColor items-center cursor-pointer text-sm transition-colors"
                    onClick={() => setOpenSection(s => ({ ...s, details: !s.details }))}
                >
                    Product Details
                    {openSection.details ? <GoChevronDown /> : <GoChevronRight />}
                </button>
                <div
                    className="formDrawer flex flex-col w-full items-center justify-center p-4 gap-6"
                    style={{
                        maxHeight: openSection.details ? 2000 : 0,
                        opacity: openSection.details ? 1 : 0,
                        pointerEvents: openSection.details ? 'auto' : 'none'
                    }}
                >
                    <BasicInfo form={form} handleChange={handleChange} missingFields={missingFields} />

                    <ImagesField
                        images={form.images}
                        imageValidationErrors={imageValidationErrors}
                        dragImagesActive={dragImagesActive}
                        setDragImagesActive={setDragImagesActive}
                        imageInputRef={imageInputRef}
                        handleImageChange={handleImageChange}
                        handleImageDrop={handleImageDrop}
                        handleRemoveImage={handleRemoveImage}
                        pendingImages={pendingImages}
                        setImageValidationErrors={setImageValidationErrors}
                        missingFields={missingFields}
                    />

                    <ProductTypeCategory
                        form={form}
                        setForm={setForm}
                        isAdmin={isAdmin}
                        categories={categories}
                        subcategories={subcategories}
                    />

                    <ViewableModelField
                        viewableValidationErrors={viewableValidationErrors}
                        dragViewableModelActive={dragViewableModelActive}
                        setDragViewableModelActive={setDragViewableModelActive}
                        viewableModelInputRef={viewableModelInputRef}
                        pendingViewableModel={pendingViewableModel}
                        handleViewableModelChange={handleViewableModelChange}
                        handleRemoveViewableModel={handleRemoveViewableModel}
                        form={form}
                    />

                    <PaidAssetsField
                        form={form}
                        modelValidationErrors={modelValidationErrors}
                        dragActive={dragActive}
                        setDragActive={setDragActive}
                        modelInputRef={modelInputRef}
                        handleModelChange={handleModelChange}
                        handleModelDrop={handleModelDrop}
                        handleRemoveModel={handleRemoveModel}
                        pendingModels={pendingModels}
                    />
                </div>
            </div>


            <div ref={shippingSectionRef} className="flex flex-col w-full border border-borderColor rounded-sm">
                <button
                    type="button"
                    className="flex font-medium justify-between bg-borderColor/40 hover:bg-borderColor/70 w-full px-4 py-2 border-b border-borderColor items-center cursor-pointer text-sm transition-colors"
                    onClick={() => setOpenSection(s => ({ ...s, shipping: !s.shipping }))}
                >
                    Shipping Details
                    {openSection.shipping ? <GoChevronDown /> : <GoChevronRight />}
                </button>
                <div
                    className="formDrawer flex flex-col w-full items-center justify-center p-4 gap-6"
                    style={{
                        maxHeight: openSection.shipping ? 2000 : 0,
                        opacity: openSection.shipping ? 1 : 0,
                        pointerEvents: openSection.shipping ? 'auto' : 'none'
                    }}
                >
                    <ShippingFields form={form} handleChange={handleChange} setForm={setForm} missingFields={missingFields} />
                </div>
            </div>


            <div ref={pricingSectionRef} className="flex flex-col w-full border border-borderColor rounded-sm">
                <button
                    type="button"
                    className="flex font-medium justify-between bg-borderColor/40 hover:bg-borderColor/70 w-full px-4 py-2 border-b border-borderColor items-center cursor-pointer text-sm transition-colors"
                    onClick={() => setOpenSection(s => ({ ...s, pricing: !s.pricing }))}
                >
                    Pricing Details
                    {openSection.pricing ? <GoChevronDown /> : <GoChevronRight />}
                </button>
                <div
                    className="formDrawer flex flex-col w-full items-center justify-center p-4 gap-3"
                    style={{
                        maxHeight: openSection.pricing ? 2000 : 0,
                        opacity: openSection.pricing ? 1 : 0,
                        pointerEvents: openSection.pricing ? 'auto' : 'none'
                    }}
                >
                    <PricingFields form={form} setForm={setForm} allCurrencies={allCurrencies} missingFields={missingFields} />

                    <VariantTypesField
                        form={form}
                        setForm={setForm}
                        isDigitalDelivery={form.delivery?.deliveryTypes?.some(dt => dt.type === 'digital' || dt === 'digital')}
                    />

                    <DiscountsField form={form} setForm={setForm} events={events} />
                </div>
            </div>

            <div className="flex flex-col gap-1 w-full mt-4">

                <button
                    type="submit"
                    className="formBlackButton w-full"
                >
                    {isLoading ? (
                        <>
                            Saving Product
                            <div className='animate-spin ml-3 border border-t-transparent h-3 w-3 rounded-full' />
                        </>
                    ) :
                        'Save Product'
                    }
                </button>

                {product && product._id && (
                    <button
                        type="button"
                        className="formRedButton w-full"
                        onClick={handleDelete}
                    >
                        {deleting ? (
                            <>
                                Deleting Product
                                <div className='animate-spin ml-3 border border-t-transparent h-3 w-3 rounded-full' />
                            </>
                        ) :
                            'Delete Product'
                        }
                    </button>
                )}

                <button className="formButton2 w-full mt-4">
                    Hide Product
                </button>
            </div>
        </form >
    )
}

export default ProductForm