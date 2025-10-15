'use client'
import { useUser } from "@clerk/nextjs";
import Image from "next/image"
import { RxCross1 } from "react-icons/rx"
import { BsPlus } from "react-icons/bs"
import { useEffect, useRef, useState } from "react"
import {
    SHOP_CATEGORIES,
    SHOP_SUBCATEGORIES,
    PRINT_CATEGORIES,
    PRINT_SUBCATEGORIES,
} from "@/lib/categories"
import { supportedCountries } from '@/lib/supportedCountries'
import SelectField from "./SelectField";
import { GoChevronDown, GoChevronLeft, GoChevronRight } from "react-icons/go";
import { BiMinus } from "react-icons/bi";
import { useToast } from "../General/ToastProvider";
import { uploadImages, uploadModels, uploadViewable } from "@/utils/uploadHelpers";
import Link from "next/link";
import useAccess from "@/utils/useAccess";

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
        // New admin-configurable fields
        categoryId: "",
        subcategoryId: "",
        stock: 1,

        // Base price system
        basePrice: {
            presentmentAmount: 0,
            presentmentCurrency: "SGD",
        },
        priceCredits: 0,

        // New variant type system
        variantTypes: [],

        // Legacy variants (for backward compatibility)
        variants: [],
        variantInput: "",
        variantForm: {
            name: "",
            presentmentAmount: 0,
            presentmentCurrency: "SGD",
            priceCredits: "",
            stock: 1,
        },
        deliveryTypes: {
            digital: false,
            selfCollect: false,
            singpost: false,
            privateDelivery: false,
        },
        dimensions: {
            length: 0,
            width: 0,
            height: 0,
            weight: 0,
        },
        pickupLocation: "",
        royaltyFees: {
            singpost: 0,
            privateDelivery: 0,
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
                // Get hardcoded categories as fallback
                const hardcodedCategories = form.productType === "shop" ? SHOP_CATEGORIES : PRINT_CATEGORIES;
                const hardcodedSubcategories = form.productType === "shop" ? SHOP_SUBCATEGORIES : PRINT_SUBCATEGORIES;

                // Fetch delivery types and categories from AppSettings
                const settingsRes = await fetch('/api/admin/settings');
                if (settingsRes.ok) {
                    const settingsData = await settingsRes.json();

                    // Handle delivery types
                    const applicableDeliveryTypes = (settingsData.deliveryTypes || []).filter(dt =>
                        dt.isActive && dt.applicableToProductTypes?.includes(form.productType)
                    );
                    setAdminDeliveryTypes(applicableDeliveryTypes);

                    // Handle categories - combine hardcoded with admin-created
                    const adminCategoryNames = (settingsData.categories || [])
                        .filter(cat => cat.type === form.productType && cat.isActive && !cat.isHardcoded)
                        .map(cat => cat.displayName);

                    const combinedCategories = [...hardcodedCategories, ...adminCategoryNames];
                    setAdminCategories(combinedCategories);

                    // Handle subcategories (for now, use hardcoded ones until admin subcategories are implemented)
                    setAdminSubcategories(hardcodedSubcategories);
                } else {
                    // Fallback to hardcoded categories only
                    setAdminCategories(hardcodedCategories);
                    setAdminSubcategories(hardcodedSubcategories);
                }
            } catch (error) {
                console.error('Error fetching admin config:', error);
                // Fallback to hardcoded categories only
                const hardcodedCategories = form.productType === "shop" ? SHOP_CATEGORIES : PRINT_CATEGORIES;
                const hardcodedSubcategories = form.productType === "shop" ? SHOP_SUBCATEGORIES : PRINT_SUBCATEGORIES;
                setAdminCategories(hardcodedCategories);
                setAdminSubcategories(hardcodedSubcategories);
            }
        };

        fetchAdminConfig();
    }, [form.productType]);

    // Admin-configurable options state
    const [adminCategories, setAdminCategories] = useState([]);
    const [adminSubcategories, setAdminSubcategories] = useState([]);
    const [adminDeliveryTypes, setAdminDeliveryTypes] = useState([]);

    // Use combined categories (hardcoded + admin) or fallback to legacy
    const categories = adminCategories.length > 0 ? adminCategories : (form.productType === "shop" ? SHOP_CATEGORIES : PRINT_CATEGORIES);
    const subcategories = adminSubcategories.length > 0 ? adminSubcategories : (form.productType === "shop" ? SHOP_SUBCATEGORIES : PRINT_SUBCATEGORIES);

    // form state functions

    function mapProductToForm(product, defaultForm) {
        const deliveryTypes = {
            digital: false,
            selfCollect: false,
            singpost: false,
            privateDelivery: false,
        };
        let pickupLocation = "";
        let royaltyFees = {
            singpost: 0,
            privateDelivery: 0,
        };

        if (product.delivery && Array.isArray(product.delivery.deliveryTypes)) {
            product.delivery.deliveryTypes.forEach(dt => {
                if (dt.type === "digital") {
                    deliveryTypes.digital = true;
                }
                if (dt.type === "selfCollect") {
                    deliveryTypes.selfCollect = true;
                    pickupLocation = dt.pickupLocation || "";
                }
                if (dt.type === "singpost") {
                    deliveryTypes.singpost = true;
                    royaltyFees.singpost = dt.royaltyFee || 0;
                }
                if (dt.type === "privateDelivery") {
                    deliveryTypes.privateDelivery = true;
                    royaltyFees.privateDelivery = dt.royaltyFee || 0;
                }
            });
        }

        const discount = {
            eventId: product.discount?.eventId ?? "",
            percentage: product.discount?.percentage ?? "",
            minimumPrice: product.discount?.minimumAmount ?? "",
            startDate: product.discount?.startDate
                ? new Date(product.discount.startDate).toISOString().slice(0, 10)
                : "",
            endDate: product.discount?.endDate
                ? new Date(product.discount.endDate).toISOString().slice(0, 10)
                : "",
        };

        return {
            ...defaultForm,
            ...product,
            images: product.images || [],
            paidAssets: product.paidAssets || [],
            variants: Array.isArray(product.variants) ? product.variants : [],
            deliveryTypes,
            pickupLocation,
            royaltyFees,
            // Map new admin-configurable fields
            categoryId: product.categoryId || "",
            subcategoryId: product.subcategoryId || "",
            showDiscount: !!(
                discount.percentage ||
                discount.eventId ||
                discount.minimumPrice ||
                discount.startDate ||
                discount.endDate
            ),
            discount,
        };
    }

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
        else if (name === "singpostRoyaltyFee") {
            setForm(f => ({
                ...f,
                royaltyFees: {
                    ...f.royaltyFees,
                    singpost: value
                }
            }));
        }
        else if (name === "privateRoyaltyFee") {
            setForm(f => ({
                ...f,
                royaltyFees: {
                    ...f.royaltyFees,
                    privateDelivery: value
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

    // images
    const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB - reduced from 5MB to prevent server compression failures
    const [imageValidationErrors, setImageValidationErrors] = useState([]);

    // models
    const MAX_MODEL_SIZE = 100 * 1024 * 1024; // 100MB
    const ALLOWED_MODEL_EXTS = ['obj', 'glb', 'gltf', 'stl', 'blend', 'fbx', 'zip', 'rar', '7z'];
    const [modelValidationErrors, setModelValidationErrors] = useState([]);

    // viewable models
    const MAX_VIEWABLE_SIZE = 15 * 1024 * 1024; // 15MB
    const ALLOWED_VIEWABLE_EXTS = ['glb', 'gltf'];
    const [viewableValidationErrors, setViewableValidationErrors] = useState([]);

    const validateImageFiles = (files) => {
        const errors = [];
        const validFiles = [];

        Array.from(files).forEach((file, index) => {
            // Check file type
            if (!file.type.startsWith('image/')) {
                errors.push(`File "${file.name}" is not a valid image file.`);
                return;
            }

            // Check file size
            if (file.size > MAX_IMAGE_SIZE) {
                const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
                errors.push(`File "${file.name}" is too large (${sizeMB}MB). Maximum size is 2MB.`);
                return;
            }

            validFiles.push(file);
        });

        return { errors, validFiles };
    };

    const handleImageChange = (e) => {
        const { errors, validFiles } = validateImageFiles(e.target.files);

        setImageValidationErrors(errors);

        if (validFiles.length > 0) {
            setPendingImages(prev => [...prev, ...validFiles]);
        }

        if (errors.length > 0 && e.target) {
            e.target.value = '';
            setTimeout(() => {
                setImageValidationErrors([]);
            }, 5000);
        }
    };

    const handleRemoveImage = idx => {
        let newPendingImages = pendingImages;

        if (idx < (form.images?.length || 0)) {
            setForm(f => ({
                ...f,
                images: f.images.filter((_, i) => i !== idx)
            }));
        } else {
            newPendingImages = pendingImages.filter((_, i) => i !== (idx - (form.images?.length || 0)));
            setPendingImages(newPendingImages);
        }

        if (imageInputRef.current) {
            imageInputRef.current.value = "";
        }

        // Re-validate remaining pending images
        if (newPendingImages.length > 0) {
            const { errors } = validateImageFiles(newPendingImages);
            setImageValidationErrors(errors);
        } else {
            setImageValidationErrors([]);
        }
    };

    // models (paid assets)

    const validateModelFiles = (files) => {
        const errors = [];
        const validFiles = [];

        Array.from(files).forEach((file) => {
            const ext = file.name.split('.').pop()?.toLowerCase();

            // Check file extension
            if (!ext || !ALLOWED_MODEL_EXTS.includes(ext)) {
                errors.push(`File "${file.name}" has an unsupported format. Allowed: ${ALLOWED_MODEL_EXTS.join(', ')}`);
                return;
            }

            // Check file size
            if (file.size > MAX_MODEL_SIZE) {
                const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
                errors.push(`File "${file.name}" is too large (${sizeMB}MB). Maximum size is 100MB.`);
                return;
            }

            validFiles.push(file);
        });

        return { errors, validFiles };
    };

    const handleModelChange = (e) => {
        const { errors, validFiles } = validateModelFiles(e.target.files);

        setModelValidationErrors(errors);

        if (validFiles.length > 0) {
            setPendingModels(prev => [...prev, ...validFiles]);
        }

        // Clear the input if there were errors
        if (errors.length > 0 && e.target) {
            e.target.value = '';
        }
    };

    const handleRemoveModel = idx => {
        if (idx < (form.paidAssets?.length || 0)) {
            setForm(f => ({
                ...f,
                paidAssets: f.paidAssets.filter((_, i) => i !== idx)
            }));
        } else {
            setPendingModels(pendingModels => pendingModels.filter((_, i) => i !== (idx - (form.paidAssets?.length || 0))));
        }
        if (modelInputRef.current) {
            modelInputRef.current.value = "";
        }
        // Clear validation errors when models are removed
        setModelValidationErrors([]);
    };

    // viewable model

    const validateViewableModel = (file) => {
        const errors = [];

        if (!file) return { errors, validFile: null };

        const ext = file.name.split('.').pop()?.toLowerCase();

        // Check file extension
        if (!ext || !ALLOWED_VIEWABLE_EXTS.includes(ext)) {
            errors.push(`File "${file.name}" has an unsupported format. Allowed: ${ALLOWED_VIEWABLE_EXTS.join(', ')}`);
            return { errors, validFile: null };
        }

        // Check file size
        if (file.size > MAX_VIEWABLE_SIZE) {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
            errors.push(`File "${file.name}" is too large (${sizeMB}MB). Maximum size is 15MB.`);
            return { errors, validFile: null };
        }

        return { errors, validFile: file };
    };

    const handleViewableModelChange = (e) => {
        const { errors, validFile } = validateViewableModel(e.target.files[0]);

        setViewableValidationErrors(errors);

        if (validFile) {
            setPendingViewableModel(validFile);
        }

        // Clear the input if there were errors
        if (errors.length > 0 && e.target) {
            e.target.value = '';
        }
    };

    const handleRemoveViewableModel = (e) => {
        if (pendingViewableModel) {
            setPendingViewableModel(null);
        } else {
            setForm(f => ({
                ...f,
                viewableModel: ""
            }));
        }

        if (viewableModelInputRef.current) {
            viewableModelInputRef.current.value = "";
        }
        // Clear validation errors when viewable model is removed
        setViewableValidationErrors([]);
    }

    // variants

    const handleAddVariant = (e) => {
        e.preventDefault();
        const { name, presentmentAmount, presentmentCurrency, priceCredits, stock } = form.variantForm;

        if (!name.trim()) return;

        // Check if variant with this name already exists
        if (form.variants.some(v => v.name === name.trim())) return;

        // Limit to 5 variants
        if (form.variants.length >= 5) return;

        const newVariant = {
            name: name.trim(),
            price: {
                presentmentCurrency: presentmentCurrency || "SGD",
                presentmentAmount: Number(presentmentAmount) || 0,
            },
            priceCredits: Number(priceCredits) || 0,
            stock: form.deliveryTypes.digital ? 1 : (Number(stock) || 1),
        };

        setForm(f => ({
            ...f,
            variants: [...f.variants, newVariant],
            variantForm: {
                name: "",
                presentmentAmount: 0,
                presentmentCurrency: "SGD",
                priceCredits: "",
                stock: 1,
            }
        }));
    };

    const handleRemoveVariant = (idx) => {
        setForm(f => ({
            ...f,
            variants: f.variants.filter((_, i) => i !== idx)
        }));
    };

    const handleVariantFormChange = (e) => {
        const { name, value } = e.target;
        setForm(f => ({
            ...f,
            variantForm: {
                ...f.variantForm,
                [name]: name === 'stock' && f.deliveryTypes.digital ? 1 : value
            }
        }));
    };

    // cleanup uploaded files in case of failure
    const cleanupUploadedFiles = async (filePaths) => {
        try {
            const response = await fetch('/api/upload/cleanup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: filePaths })
            });

            if (!response.ok) {
                console.error('File cleanup failed:', await response.text());
            }
        } catch (error) {
            console.error('File cleanup error:', error);
        }
    };

    //submit

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isLoaded) return;

        // Validate that at least one image exists
        const totalImages = (form.images?.length || 0) + pendingImages.length;
        if (totalImages === 0) {
            showToast("Please add at least one product image before saving.", "error");
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

        const payload = {
            creatorUserId: user?.id,
            name: form.name,
            description: form.description,
            images: [...form.images, ...uploadedImages],
            paidAssets: [...form.paidAssets, ...uploadedModels],
            viewableModel: uploadedViewable ? uploadedViewable : form.viewableModel,
            productType: form.productType,
            // Base pricing system
            basePrice: {
                presentmentCurrency: form.basePrice?.presentmentCurrency || 'SGD',
                presentmentAmount: Number(form.basePrice?.presentmentAmount) || 0,
            },
            priceCredits: Number(form.priceCredits) || 0,
            stock: Number(form.stock) || 1,
            // New variant types system
            variantTypes: form.variantTypes || [],
            // Legacy categories (for backward compatibility)
            category: Number(form.category),
            subcategory: Number(form.subcategory),
            // New admin-configurable categories
            categoryId: form.categoryId || null,
            subcategoryId: form.subcategoryId || null,
            // Legacy variants system (for backward compatibility)
            variants: form.variants,
            delivery: {
                deliveryTypes: [
                    ...(form.deliveryTypes.digital
                        ? [{
                            type: "digital",
                            royaltyFee: 0,
                        }] : []),
                    ...(form.deliveryTypes.selfCollect
                        ? [{
                            type: "selfCollect",
                            pickupLocation: form.pickupLocation || null,
                            royaltyFee: 0,
                        }] : []),
                    ...(form.deliveryTypes.singpost
                        ? [{
                            type: "singpost",
                            royaltyFee: Number(form.royaltyFees.singpost) || 0,
                        }] : []),
                    ...(form.deliveryTypes.privateDelivery
                        ? [{
                            type: "privateDelivery",
                            royaltyFee: Number(form.royaltyFees.privateDelivery) || 0,
                        }] : []),
                ]
            },
            dimensions: {
                length: Number(form.dimensions.length),
                width: Number(form.dimensions.width),
                height: Number(form.dimensions.height),
                weight: Number(form.dimensions.weight),
            },
            discount: form.showDiscount ? {
                eventId: form.discount.eventId || null,
                percentage: form.discount.percentage ? Number(form.discount.percentage) : undefined,
                minimumAmount: form.discount.minimumPrice ? Number(form.discount.minimumPrice) : undefined,
                startDate: form.discount.startDate ? new Date(form.discount.startDate) : undefined,
                endDate: form.discount.endDate ? new Date(form.discount.endDate) : undefined,
            } : {},
        };

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
                showToast(data.error || "Failed to create product", 'error');
            } else {
                if (!res.ok) {
                    showToast(data.error || "Failed to create product", 'error');
                } else {
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
                }
            }
        } catch (err) {
            showToast("Network error: " + err.message, 'error');
        }
        setIsLoading(false);
    }

    useEffect(() => {
        if (form.deliveryTypes.digital) {
            setForm(f => ({
                ...f,
                variants: f.variants.length > 1 ? f.variants.slice(0, 1) : f.variants,
                variantTypes: [],
                variantInput: "",
                stock: null,
                deliveryTypes: {
                    ...f.deliveryTypes,
                    digital: true,
                    selfCollect: false,
                    singpost: false,
                    privateDelivery: false,
                },
            }));
        }
    }, [form.deliveryTypes.digital]);


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

            <div className="flex flex-col w-full border border-borderColor rounded-sm">
                <button type="button" className="flex font-medium justify-between bg-borderColor/40 w-full px-4 py-2 border-b border-borderColor items-center cursor-pointer  text-sm"
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

                    {/* product images */}
                    <div className="flex flex-col gap-2 w-full">
                        <label className="formLabel">Product Images</label>
                        {imageValidationErrors.length > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-2">
                                <div className="text-xs text-red-700 space-y-1">
                                    {imageValidationErrors.map((error, index) => (
                                        <div key={index}> {error}</div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div
                            className={`formDrag ${dragImagesActive ? "bg-borderColor/30" : ""}`}
                            onClick={() => form.images.length < 7 && imageInputRef.current && imageInputRef.current.click()}
                            onDragOver={e => {
                                if (form.images.length < 7) {
                                    e.preventDefault();
                                    setDragImagesActive(true);
                                }
                            }}
                            onDragLeave={e => {
                                e.preventDefault();
                                setDragImagesActive(false);
                            }}
                            onDrop={e => {
                                e.preventDefault();
                                setDragImagesActive(false);
                                if (form.images.length < 7 && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                    const { errors, validFiles } = validateImageFiles(e.dataTransfer.files);
                                    setImageValidationErrors(errors);
                                    if (validFiles.length > 0) {
                                        setPendingImages(prev => [...prev, ...validFiles]);
                                    }
                                    // Auto-clear validation errors after 5 seconds for drag-and-drop too
                                    if (errors.length > 0) {
                                        setTimeout(() => {
                                            setImageValidationErrors([]);
                                        }, 5000);
                                    }
                                }
                            }}
                        >
                            {form.images.length >= 7 ? (
                                <span className="text-center text-sm text-lightColor">Maximum 7 images reached</span>
                            ) : (
                                <span className="text-center">Click to choose images or drag and drop here (max 7 images, 2MB each)</span>
                            )}
                            <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={handleImageChange}
                                style={{ display: "none" }}
                                disabled={form.images.length >= 7}
                                ref={imageInputRef}
                            />
                        </div>
                        <div className="flex gap-2 flex-wrap mt-2">
                            {[...(form.images || []), ...pendingImages].map((item, idx) => {
                                const isPending = idx >= (form.images?.length || 0);
                                return (
                                    <div key={idx} className='relative'>
                                        <Image
                                            src={
                                                isPending
                                                    ? URL.createObjectURL(item)
                                                    : `/api/proxy?key=${encodeURIComponent(item)}`
                                            }
                                            alt={`Preview ${idx + 1}`}
                                            loading="lazy"
                                            width={80}
                                            height={80}
                                            quality={20}
                                            className="w-20 h-20 object-cover rounded-sm border border-borderColor"
                                        />
                                        <RxCross1
                                            className="absolute top-1 right-1 cursor-pointer p-0.5 bg-white/80 rounded-full"
                                            size={14}
                                            onClick={() => handleRemoveImage(idx)}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* product type */}
                    <SelectField
                        onChangeFunction={e => {
                            const val = e.target.value;
                            if (val === "shop" && !isAdmin) return; // Prevent non-admin from selecting shop
                            setForm(f => ({
                                ...f,
                                productType: val,
                                category: 0,
                                subcategory: 0
                            }));
                        }}
                        value={form.productType}
                        name="productType"
                        label="Product Type"
                        options={[
                            { value: "print", label: "Print" },
                            ...(isAdmin ? [{ value: "shop", label: "Shop" }] : [])
                        ]}
                    />

                    {/* product category */}
                    <SelectField
                        onChangeFunction={e =>
                            setForm(f => ({
                                ...f,
                                category: Number(e.target.value),
                                subcategory: 0
                            }))}
                        value={form.category}
                        name="category"
                        label="Category"
                        options={[
                            { value: "", label: "Select a category" },
                            ...categories.map((cat, idx) => ({ value: idx, label: cat }))
                        ]}
                    />

                    {/* product subcategory */}
                    <SelectField
                        onChangeFunction={e =>
                            setForm(f => ({
                                ...f,
                                subcategory: Number(e.target.value)
                            }))}
                        value={form.subcategory}
                        name="subcategory"
                        label="Subcategory"
                        options={[
                            { value: "", label: "Select a subcategory" },
                            ...(subcategories[form.category] || []).map((sub, idx) => ({ value: idx, label: sub }))
                        ]}
                    />

                    {/* viewable model only .glb or .gltf */}
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
                                    const { errors, validFile } = validateViewableModel(e.dataTransfer.files[0]);
                                    setViewableValidationErrors(errors);
                                    if (validFile) {
                                        setPendingViewableModel(validFile);
                                    }
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

                    {/* paid assets (3D models) */}
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
                                    const { errors, validFiles } = validateModelFiles(e.dataTransfer.files);
                                    setModelValidationErrors(errors);
                                    if (validFiles.length > 0) {
                                        setPendingModels(prev => [...prev, ...validFiles]);
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
                </div>
            </div>


            <div className="flex flex-col w-full border border-borderColor rounded-sm">
                <button type="button"
                    className="flex font-medium justify-between bg-borderColor/40 w-full px-4 py-2 border-b border-borderColor items-center cursor-pointer  text-sm"
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
                    {/* dimensions */}
                    <div className="flex flex-col w-full gap-3">
                        <label className="formLabel">Product Dimensions</label>
                        <div className="flex flex-row items-center gap-4 w-full">
                            <div className="flex-1/4 flex-col flex gap-1">
                                <label htmlFor="length" className="text-xs font-normal text-lightColor">Length (cm)</label>
                                <input
                                    id="length"
                                    name="length"
                                    type="float"
                                    min={0}
                                    onChange={handleChange}
                                    value={form.dimensions.length}
                                    className="formInput"
                                    placeholder="Enter length"
                                />
                            </div>
                            <div className="flex-1/4 flex-col flex gap-1">
                                <label htmlFor="width" className="text-xs font-normal text-lightColor">Width (cm)</label>
                                <input
                                    id="width"
                                    name="width"
                                    type="float"
                                    min={0}
                                    onChange={handleChange}
                                    value={form.dimensions.width}
                                    className="formInput"
                                    placeholder="Enter width"
                                />
                            </div>
                            <div className="flex-1/4 flex-col flex gap-1">
                                <label htmlFor="height" className="text-xs font-normal text-lightColor">Height (cm)</label>
                                <input
                                    id="height"
                                    name="height"
                                    type="float"
                                    min={0}
                                    onChange={handleChange}
                                    value={form.dimensions.height}
                                    className="formInput"
                                    placeholder="Enter height"
                                />
                            </div>
                            <div className="flex-1/4 flex-col flex gap-1">
                                <label htmlFor="weight" className="text-xs font-normal text-lightColor">Weight (kg)</label>
                                <input
                                    id="weight"
                                    name="weight"
                                    type="float"
                                    min={0}
                                    onChange={handleChange}
                                    value={form.dimensions.weight}
                                    className="formInput"
                                    placeholder="Enter weight"
                                />
                            </div>
                        </div>
                    </div>

                    {/* delivery types */}
                    <div className="flex flex-col gap-3 w-full">
                        <label className="formLabel">Delivery Types</label>
                        <div className="flex flex-col gap-2 font-normal text-sm">
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="digital"
                                    name="digital"
                                    checked={form.deliveryTypes.digital}
                                    onChange={e => {
                                        const isChecked = e.target.checked;
                                        setForm(f => ({
                                            ...f,
                                            deliveryTypes: {
                                                ...f.deliveryTypes,
                                                digital: isChecked,
                                                // If digital is checked, uncheck all other delivery types
                                                ...(isChecked && {
                                                    selfCollect: false,
                                                    singpost: false,
                                                    privateDelivery: false,
                                                })
                                            }
                                        }))
                                    }}
                                />
                                <label htmlFor="digital">Digital Product</label>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="selfCollect"
                                    name="selfCollect"
                                    checked={form.deliveryTypes.selfCollect}
                                    onChange={e => {
                                        if (!form.deliveryTypes.digital) {
                                            setForm(f => ({
                                                ...f,
                                                deliveryTypes: {
                                                    ...f.deliveryTypes,
                                                    selfCollect: e.target.checked
                                                }
                                            }))
                                        }
                                    }}
                                    disabled={form.deliveryTypes.digital} // disable if digital is checked
                                />
                                <label htmlFor="selfCollect">Self Collection</label>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="singpost"
                                    name="singpost"
                                    checked={form.deliveryTypes.singpost}
                                    onChange={e => {
                                        if (!form.deliveryTypes.digital) {
                                            setForm(f => ({
                                                ...f,
                                                deliveryTypes: {
                                                    ...f.deliveryTypes,
                                                    singpost: e.target.checked
                                                }
                                            }))
                                        }
                                    }}
                                    disabled={form.deliveryTypes.digital} // disable if digital is checked
                                />
                                <label htmlFor="singpost">Singpost</label>
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="privateDelivery"
                                    name="privateDelivery"
                                    checked={form.deliveryTypes.privateDelivery}
                                    onChange={e => {
                                        if (!form.deliveryTypes.digital) {
                                            setForm(f => ({
                                                ...f,
                                                deliveryTypes: {
                                                    ...f.deliveryTypes,
                                                    privateDelivery: e.target.checked
                                                }
                                            }))
                                        }
                                    }}
                                    disabled={form.deliveryTypes.digital} // disable if digital is checked
                                />
                                <label htmlFor="privateDelivery">Private</label>
                            </div>
                        </div>

                        {/* pickup location */}
                        {form.deliveryTypes.selfCollect && (
                            <div className="flex flex-col gap-1 mt-2">
                                <label htmlFor="pickupLocation" className="formLabel">Pickup Location</label>
                                <input
                                    id="pickupLocation"
                                    name="pickupLocation"
                                    type="text"
                                    value={form.pickupLocation}
                                    onChange={handleChange}
                                    placeholder="Enter pickup location"
                                    className="formInput"
                                    required
                                    disabled={form.deliveryTypes.digital} // disable if digital is checked
                                />
                            </div>
                        )}

                        {/* singpost royalty */}
                        {form.deliveryTypes.singpost && (
                            <div className="flex flex-col gap-1 mt-2">
                                <label htmlFor="singpostRoyaltyFee" className="formLabel">Singpost Royalty Fee ($)</label>
                                <input
                                    id="singpostRoyaltyFee"
                                    name="singpostRoyaltyFee"
                                    type="number"
                                    min={0}
                                    value={form.royaltyFees.singpost}
                                    onChange={e =>
                                        setForm(f => ({
                                            ...f,
                                            royaltyFees: {
                                                ...f.royaltyFees,
                                                singpost: Number(e.target.value)
                                            }
                                        }))
                                    }
                                    className="formInput"
                                    required
                                    disabled={form.deliveryTypes.digital} // disable if digital is checked
                                />
                            </div>
                        )}

                        {/* private royalty */}
                        {form.deliveryTypes.privateDelivery && (
                            <div className="flex flex-col gap-1 mt-2">
                                <label htmlFor="privateRoyaltyFee" className="formLabel">Private Delivery Royalty Fee ($)</label>
                                <input
                                    id="privateRoyaltyFee"
                                    name="privateRoyaltyFee"
                                    type="number"
                                    min={0}
                                    value={form.royaltyFees.privateDelivery}
                                    onChange={e =>
                                        setForm(f => ({
                                            ...f,
                                            royaltyFees: {
                                                ...f.royaltyFees,
                                                privateDelivery: Number(e.target.value)
                                            }
                                        }))
                                    }
                                    className="formInput"
                                    required
                                    disabled={form.deliveryTypes.digital} // disable if digital is checked
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>


            <div className="flex flex-col w-full border border-borderColor rounded-sm">
                <button type="button" className="flex font-medium justify-between bg-borderColor/40 w-full px-4 py-2 border-b border-borderColor items-center cursor-pointer text-sm"
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
                    {/* Base Price Section */}
                    <div className="flex flex-col gap-2 w-full">
                        <label className="formLabel">Base Price</label>
                        <p className="text-xs text-lightColor mb-2">
                            Set the starting price for your product. Additional fees from variant choices will be added to this base price.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-xs text-lightColor">Currency</label>
                                <SelectField
                                    onChangeFunction={(e) => setForm(f => ({
                                        ...f,
                                        basePrice: { ...f.basePrice, presentmentCurrency: e.target.value }
                                    }))}
                                    value={form.basePrice?.presentmentCurrency || 'SGD'}
                                    name="basePriceCurrency"
                                    label=""
                                    options={allCurrencies.map(code => ({ value: code, label: code }))}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-lightColor">Amount</label>
                                <input
                                    name="basePriceAmount"
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={form.basePrice?.presentmentAmount || 0}
                                    onChange={(e) => setForm(f => ({
                                        ...f,
                                        basePrice: { ...f.basePrice, presentmentAmount: parseFloat(e.target.value) || 0 }
                                    }))}
                                    className="formInput"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-lightColor">Credits</label>
                            <input
                                name="priceCredits"
                                type="number"
                                min={0}
                                value={form.priceCredits || 0}
                                onChange={(e) => setForm(f => ({ ...f, priceCredits: parseInt(e.target.value) || 0 }))}
                                className="formInput"
                                placeholder="0"
                            />
                            <p className="text-xs text-lightColor mt-1">
                                Alternative payment method using platform credits.
                            </p>
                        </div>
                    </div>

                    {/* Variant Types Section */}
                    <div className="flex flex-col gap-2 w-full">
                        <label className="formLabel">Variant Types (up to 5)</label>
                        <p className="text-xs text-lightColor mb-2">
                            Create variant types (like Color, Size, Material) with options that have additional fees.
                            Customers will select one option from each variant type, and all additional fees will be added to the base price.
                            {form.deliveryTypes.digital && (
                                <span className="text-red-500 block mt-1">
                                    Note: Variant types are not available for digital products.
                                </span>
                            )}
                        </p>

                        {/* Add new variant type */}
                        <div className="border border-borderColor rounded p-4 bg-extraLight/10">
                            <div className="flex flex-col gap-3">
                                <div>
                                    <label className="text-xs text-lightColor">Variant Type Name</label>
                                    <input
                                        type="text"
                                        className="formInput"
                                        placeholder="e.g., Color, Size, Material"
                                        maxLength={50}
                                        id="variantTypeName"
                                        disabled={form.deliveryTypes.digital}
                                    />
                                    <p className="text-xs text-lightColor mt-1">
                                        Example: "Color" for a variant type that includes Red, Blue, Green options.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    className="formBlackButton"
                                    disabled={form.variantTypes?.length >= 5 || form.deliveryTypes.digital}
                                    onClick={() => {
                                        const input = document.getElementById('variantTypeName');
                                        const name = input.value.trim();
                                        if (name && !form.deliveryTypes.digital) {
                                            setForm(f => ({
                                                ...f,
                                                variantTypes: [...(f.variantTypes || []), { name, options: [] }]
                                            }));
                                            input.value = '';
                                        }
                                    }}
                                >
                                    Add Variant Type ({form.variantTypes?.length || 0}/5)
                                </button>
                            </div>
                        </div>

                        {/* Display existing variant types */}
                        {form.variantTypes?.map((variantType, typeIdx) => (
                            <div key={typeIdx} className="border border-borderColor rounded p-4 bg-white">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-medium text-sm">{variantType.name}</h4>
                                    <RxCross1
                                        className="cursor-pointer text-lightColor hover:text-textColor"
                                        size={16}
                                        onClick={() => {
                                            if (!form.deliveryTypes.digital) {
                                                setForm(f => ({
                                                    ...f,
                                                    variantTypes: f.variantTypes.filter((_, i) => i !== typeIdx)
                                                }));
                                            }
                                        }}
                                    />
                                </div>

                                {/* Add option to variant type */}
                                <div className="flex flex-col gap-2 mb-3">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-xs text-lightColor">Option Name</label>
                                            <input
                                                type="text"
                                                className="formInput text-sm"
                                                placeholder="e.g., Red, Large, Plastic"
                                                id={`optionName-${typeIdx}`}
                                                disabled={form.deliveryTypes.digital}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs text-lightColor">Additional Fee</label>
                                            <input
                                                type="number"
                                                min={0}
                                                step="0.01"
                                                className="formInput text-sm"
                                                placeholder="0.00"
                                                id={`optionFee-${typeIdx}`}
                                                disabled={form.deliveryTypes.digital}
                                            />
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="formButton text-sm py-1"
                                        disabled={form.deliveryTypes.digital}
                                        onClick={() => {
                                            if (!form.deliveryTypes.digital) {
                                                const nameInput = document.getElementById(`optionName-${typeIdx}`);
                                                const feeInput = document.getElementById(`optionFee-${typeIdx}`);
                                                const name = nameInput.value.trim();
                                                const additionalFee = parseFloat(feeInput.value) || 0;

                                                if (name) {
                                                    setForm(f => ({
                                                        ...f,
                                                        variantTypes: f.variantTypes.map((vt, i) =>
                                                            i === typeIdx
                                                                ? { ...vt, options: [...vt.options, { name, additionalFee, stock: 1 }] }
                                                                : vt
                                                        )
                                                    }));
                                                    nameInput.value = '';
                                                    feeInput.value = '';
                                                }
                                            }
                                        }}
                                    >
                                        Add Option
                                    </button>
                                </div>

                                {/* Display options */}
                                {variantType.options?.map((option, optionIdx) => (
                                    <div key={optionIdx} className="flex items-center justify-between bg-extraLight/20 p-2 rounded mb-1">
                                        <span className="text-sm">
                                            {option.name}
                                            {option.additionalFee > 0 && (
                                                <span className="text-lightColor"> (+${option.additionalFee.toFixed(2)})</span>
                                            )}
                                        </span>
                                        <RxCross1
                                            className="cursor-pointer text-lightColor hover:text-textColor"
                                            size={14}
                                            onClick={() => {
                                                if (!form.deliveryTypes.digital) {
                                                    setForm(f => ({
                                                        ...f,
                                                        variantTypes: f.variantTypes.map((vt, i) =>
                                                            i === typeIdx
                                                                ? { ...vt, options: vt.options.filter((_, j) => j !== optionIdx) }
                                                                : vt
                                                        )
                                                    }));
                                                }
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>



                    {/* discount */}
                    <div className="flex flex-col gap-2 w-full">
                        <label className="formLabel">Discounts</label>
                        {/* Add Discount Button */}
                        <button
                            type="button"
                            className="formButton"
                            onClick={() => setForm(f => ({ ...f, showDiscount: true }))}
                            disabled={form.showDiscount}
                        >
                            Add Discount
                            <BsPlus className="ml-2" size={20} />
                        </button>

                        {/* discount box */}
                        {form.showDiscount && (
                            <div className="flex flex-col gap-2 bg-baseColor border border-extraLight p-4 rounded-sm my-3">
                                {/* event selection (optional) */}
                                {events && events.length > 0 && (
                                    <div className="flex flex-col gap-1">
                                        <SelectField
                                            onChangeFunction={e =>
                                                setForm(f => ({
                                                    ...f,
                                                    discount: { ...f.discount, eventId: e.target.value }
                                                }))}
                                            value={form.discount.eventId}
                                            name="eventId"
                                            label="Event"
                                            options={[{ value: "", label: "None" }, ...events.map(ev => ({
                                                value: ev._id,
                                                label: `${ev.name} (${ev.percentage}% off)`
                                            }))]}
                                        />
                                    </div>
                                )}

                                {/* Custom discount fields */}
                                <div className="flex flex-col gap-1">
                                    <label htmlFor="discountPercentage" className="formLabel">Discount Percentage (%)</label>
                                    <input
                                        id="discountPercentage"
                                        name="discountPercentage"
                                        type="number"
                                        min={1}
                                        max={100}
                                        value={form.discount.percentage ?? ""}
                                        onChange={e => setForm(f => ({
                                            ...f,
                                            discount: { ...f.discount, percentage: e.target.value }
                                        }))}
                                        className="formInput"
                                        placeholder="e.g. 10"
                                        required={!form.discount.eventId}
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label htmlFor="discountMinimumAmount" className="formLabel">Minimum Amount</label>
                                    <input
                                        id="discountMinimumAmount"
                                        name="discountMinimumAmount"
                                        type="number"
                                        min={0}
                                        value={form.discount.minimumPrice}
                                        step="0.01"
                                        onChange={e => setForm(f => ({
                                            ...f,
                                            discount: { ...f.discount, minimumPrice: e.target.value }
                                        }))}
                                        className="formInput"
                                        placeholder="e.g. 50"
                                        required={!form.discount.eventId}
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label htmlFor="discountStartDate" className="formLabel">Start Date</label>
                                    <input
                                        id="discountStartDate"
                                        name="discountStartDate"
                                        type="date"
                                        value={form.discount.startDate}
                                        onChange={e => setForm(f => ({
                                            ...f,
                                            discount: { ...f.discount, startDate: e.target.value }
                                        }))}
                                        className="formInput"
                                        required={!form.discount.eventId}
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label htmlFor="discountEndDate" className="formLabel">End Date</label>
                                    <input
                                        id="discountEndDate"
                                        name="discountEndDate"
                                        type="date"
                                        value={form.discount.endDate}
                                        onChange={e => setForm(f => ({
                                            ...f,
                                            discount: { ...f.discount, endDate: e.target.value }
                                        }))}
                                        className="formInput"
                                        required={!form.discount.eventId}
                                    />
                                </div>
                                <button
                                    type="button"
                                    className="formButton mt-4"
                                    onClick={() =>
                                        setForm(f => ({
                                            ...f,
                                            showDiscount: false,
                                            discount: {
                                                eventId: "",
                                                percentage: "",
                                                minimumPrice: "",
                                                startDate: "",
                                                endDate: "",
                                            }
                                        }))
                                    }
                                >
                                    Remove Discount
                                    <BiMinus />
                                </button>
                            </div>
                        )}
                    </div>
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
                            <div className='animate-spin ml-3 border-1 border-t-transparent h-3 w-3 rounded-full' />
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
                                <div className='animate-spin ml-3 border-1 border-t-transparent h-3 w-3 rounded-full' />
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