'use client'
import { useUser } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react"
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

    const handleImageChange = (e) => handleImageChangeHelper(e, setPendingImages, setImageValidationErrors);
    const handleImageDrop = (fileList) => handleImageDropHelper(fileList, setPendingImages, setImageValidationErrors);
    const handleRemoveImage = (idx) => handleRemoveImageHelper(idx, form, setForm, pendingImages, setPendingImages, imageInputRef, setImageValidationErrors);

    const handleModelChange = (e) => handleModelChangeHelper(e, setPendingModels, setModelValidationErrors);
    const handleModelDrop = (fileList) => handleModelDropHelper(fileList, setPendingModels, setModelValidationErrors);
    const handleRemoveModel = (idx) => handleRemoveModelHelper(idx, form, setForm, pendingModels, setPendingModels, modelInputRef, setModelValidationErrors);

    const handleViewableModelChange = (e) => handleViewableModelChangeHelper(e, setPendingViewableModel, setViewableValidationErrors);
    const handleRemoveViewableModel = () => handleRemoveViewableModelHelper(pendingViewableModel, setPendingViewableModel, setForm, viewableModelInputRef, setViewableValidationErrors);

    // Submit handler
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
                    <BasicInfo form={form} handleChange={handleChange} />

                    <ImagesField
                        form={form}
                        imageValidationErrors={imageValidationErrors}
                        dragImagesActive={dragImagesActive}
                        setDragImagesActive={setDragImagesActive}
                        imageInputRef={imageInputRef}
                        handleImageChange={handleImageChange}
                        handleImageDrop={handleImageDrop}
                        handleRemoveImage={handleRemoveImage}
                        pendingImages={pendingImages}
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
                    <ShippingFields form={form} handleChange={handleChange} setForm={setForm} />
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
                    <PricingFields form={form} setForm={setForm} allCurrencies={allCurrencies} />

                    <VariantTypesField
                        form={form}
                        setForm={setForm}
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