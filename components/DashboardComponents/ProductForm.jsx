'use client'
// The product document (blueprint §5.5): one continuous sheet at reading
// width — GlassBar (breadcrumb · title echo · save state · CTA), a 720px
// document column of flowing sections, and a sticky side rail with
// completeness dots + scroll-spy. State management, two-phase validation,
// upload/rollback and payload building are unchanged from the legacy form.
import { useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { GoChevronLeft } from "react-icons/go";
import { supportedCountries } from '@/lib/supportedCountries'
import { useToast } from "../General/ToastProvider";
import { uploadImages, uploadModels, uploadViewable } from "@/utils/uploadHelpers";
import useAccess from "@/utils/useAccess";
import { ConfirmDialog, GlassBar, StatusPill } from '@/components/dashboard-ui';
import { swap } from '@/lib/motion/tokens';
import BasicInfo from './ProductFormFields/BasicInfo';
import ImagesField from './ProductFormFields/ImagesField';
import ProductTypeCategory from './ProductFormFields/ProductTypeCategory';
import ViewableModelField from './ProductFormFields/ViewableModelField';
import PrintConfigField from './ProductFormFields/PrintConfigField';
import PaidAssetsField from './ProductFormFields/PaidAssetsField';
import ShippingFields from './ProductFormFields/ShippingFields';
import PricingFields from './ProductFormFields/PricingFields';
import VariantTypesField from './ProductFormFields/VariantTypesField';
import DiscountsField from "./ProductFormFields/DiscountsField";
import { inputCls, labelCls, quietBtnCls, badTextBtnCls } from './ProductFormFields/dashFormUi';
import { useAdminSettings } from '@/utils/AdminSettingsContext';
import { SHOP_CATEGORIES, PRINT_CATEGORIES, SHOP_SUBCATEGORIES, PRINT_SUBCATEGORIES } from '@/lib/categories';
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

// Document order of the sheet's sections (§5.5). `print` only renders for
// print products but keeps its slot in the order.
const SECTION_ORDER = ['basics', 'photos', 'model', 'digital', 'print', 'delivery', 'pricing', 'variants', 'discounts', 'stock']

const SECTION_LABELS = {
    basics: 'Basics',
    photos: 'Photos',
    model: '3D model',
    digital: 'Digital files',
    print: 'Print settings',
    delivery: 'Delivery',
    pricing: 'Pricing',
    variants: 'Variants',
    discounts: 'Discounts',
    stock: 'Stock',
}

// Which section owns each required-field key (rail dot turns bad + scroll target).
const FIELD_TO_SECTION = {
    name: 'basics',
    description: 'basics',
    productType: 'basics',
    images: 'photos',
    deliveryTypes: 'delivery',
    basePrice: 'pricing',
    priceCredits: 'pricing',
}

const DOT_CLS = {
    ink: 'bg-[var(--dash-ink)]',
    hatch: 'dash-hatch bg-[var(--dash-card)] border border-[var(--dash-line)]',
    bad: 'bg-[var(--dash-bad)]',
}

// Completeness dot: ink = required-complete, hatch = optional/empty, bad = error.
function RailDot({ tone }) {
    return (
        <span
            aria-hidden="true"
            data-dot={tone}
            className={`inline-block h-2 w-2 rounded-full shrink-0 ${DOT_CLS[tone] || DOT_CLS.hatch}`}
        />
    )
}

function FormSection({ id, title, anchorRef, first = false, children }) {
    return (
        <section
            ref={anchorRef}
            data-section-anchor={id}
            className={`w-full flex flex-col gap-4 scroll-mt-24 pb-8 ${first ? '' : 'border-t border-[var(--dash-line)] pt-8'}`}
        >
            <h2 className="dash-section">{title}</h2>
            {children}
        </section>
    )
}

const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

function ProductForm({ mode = "Create", product = null }) {
    const { user, isLoaded } = useUser()
    const router = useRouter()
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

    // Section anchors for rail navigation, error scrolling, and scroll-spy.
    const sectionRefs = useRef({});
    const [pendingImages, setPendingImages] = useState([]);
    const [pendingModels, setPendingModels] = useState([]);
    const [pendingViewableModel, setPendingViewableModel] = useState(null);
    const [dragActive, setDragActive] = useState(false);
    const [dragImagesActive, setDragImagesActive] = useState(false);
    const [dragViewableModelActive, setDragViewableModelActive] = useState(false);

    const [isLoading, setIsLoading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

    // GlassBar save state ("Editing…" → "● Saved HH:MM"), derived from the
    // submit flow: any user edit marks the sheet dirty again.
    const [lastSavedAt, setLastSavedAt] = useState(null);
    const [dirtySinceSave, setDirtySinceSave] = useState(false);

    // Sections with phase-2 (value) validation errors; missing-field sections
    // are derived from missingFields below.
    const [errorSections, setErrorSections] = useState([]);
    const [activeSection, setActiveSection] = useState('basics');

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
        infiniteStock: false,
        hidden: false,

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
        // primary discount (kept in sync with first entry in discounts)
        discount: {
            eventId: "",
            percentage: "",
            minimumPrice: "",
            startDate: "",
            endDate: "",
            tiers: [],
        },
        // stacked discounts
        discounts: [],
    };

    const [form, setFormRaw] = useState(product ? { ...defaultForm, ...product } : defaultForm);

    // Every user-driven form change flows through this wrapper so the GlassBar
    // save state can flip back to "Editing…". System writes (product load,
    // post-save merge) use setFormRaw directly.
    const setForm = useCallback((updater) => {
        setDirtySinceSave(true)
        setFormRaw(updater)
    }, [])

    // If not admin, force productType to 'print' and reset category/subcategory if needed
    useEffect(() => {
        if (!isAdmin && form.productType !== "print") {
            setFormRaw(f => ({
                ...f,
                productType: "print",
                category: 0,
                subcategory: 0
            }));
        }
    }, [isAdmin]);

    // Fetch admin-configurable options from context
    const { settings: adminSettings, loading: adminSettingsLoading, error: adminSettingsError } = useAdminSettings();
    useEffect(() => {
        if (adminSettingsLoading) return;
        if (adminSettings) {
            // Handle delivery types
            const applicableDeliveryTypes = (adminSettings.deliveryTypes || []).filter(dt =>
                dt.isActive && dt.applicableToProductTypes?.includes(form.productType)
            );
            setAdminDeliveryTypes(applicableDeliveryTypes);

            // Handle categories - filter by type and isActive
            const activeCats = (adminSettings.categories || [])
                .filter(cat => cat.type === form.productType && cat.isActive);

            setAdminCategories(activeCats);

            // Extract active subcategories for the currently selected category
            // We'll update this when category changes
            if (activeCats.length > 0) {
                const currentCat = activeCats.find(c => c.displayName === form.categoryId);
                const activeSubs = (currentCat?.subcategories || []).filter(sub => sub.isActive);
                setAdminSubcategories(activeSubs);
            } else {
                setAdminSubcategories([]);
            }
        } else if (!adminSettingsLoading && adminSettingsError) {
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
            const currentCat = legacyCats.find(c => c.displayName === form.categoryId);
            setAdminSubcategories(currentCat?.subcategories || []);
        }
    }, [adminSettings, adminSettingsLoading, adminSettingsError, form.productType, form.categoryId]);

    // Admin-configurable options state
    const [adminCategories, setAdminCategories] = useState([]);
    const [adminSubcategories, setAdminSubcategories] = useState([]);
    const [adminDeliveryTypes, setAdminDeliveryTypes] = useState([]);

    useEffect(() => {
        if (adminCategories.length > 0 && form.categoryId) {
            const selectedCat = adminCategories.find(c => c.displayName === form.categoryId);
            setAdminSubcategories((selectedCat?.subcategories || []).filter(sub => sub.isActive));
        }
    }, [form.categoryId, adminCategories]);


    const categories = adminCategories;
    const subcategories = adminSubcategories;

    useEffect(() => {
        if (product) {
            setFormRaw(mapProductToForm(product, defaultForm));
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
        [form, pendingImages, setForm],
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
        [form, pendingModels, setForm],
    );

    const handleViewableModelChange = useCallback(
        (e) => handleViewableModelChangeHelper(e, setPendingViewableModel, setViewableValidationErrors),
        [],
    );
    const handleRemoveViewableModel = useCallback(
        () => handleRemoveViewableModelHelper(pendingViewableModel, setPendingViewableModel, setForm, viewableModelInputRef, setViewableValidationErrors),
        [pendingViewableModel, setForm],
    );

    // ---- Rail helpers -----------------------------------------------------

    const visibleSections = SECTION_ORDER
        .filter((key) => key !== 'print' || form.productType === 'print')
        .map((key) => ({ key, label: SECTION_LABELS[key] }))

    const scrollToSection = useCallback((key) => {
        const el = sectionRefs.current[key]
        if (el && typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
        }
    }, [])

    const firstBadSection = (keys) => SECTION_ORDER.find((k) => keys.includes(k))

    // Scroll-spy: highlight the section currently under the GlassBar.
    useEffect(() => {
        if (typeof IntersectionObserver === 'undefined') return undefined
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
                if (visible[0]) {
                    const key = visible[0].target.getAttribute('data-section-anchor')
                    if (key) setActiveSection(key)
                }
            },
            { rootMargin: '-96px 0px -55% 0px', threshold: 0 },
        )
        Object.values(sectionRefs.current).filter(Boolean).forEach((el) => observer.observe(el))
        return () => observer.disconnect()
    }, [form.productType])

    const totalImages = (form.images?.length || 0) + pendingImages.length;
    const missingSections = missingFields.map((f) => FIELD_TO_SECTION[f]).filter(Boolean)
    const badSections = new Set([...missingSections, ...errorSections])

    // Completeness dots (§5.5): bad = validation error, ink = required fields
    // of the section are filled, hatch = optional/empty.
    const sectionTone = (key) => {
        if (badSections.has(key)) return 'bad'
        switch (key) {
            case 'basics':
                return form.name?.trim() && form.description?.trim() ? 'ink' : 'hatch'
            case 'photos':
                return totalImages > 0 ? 'ink' : 'hatch'
            case 'model':
                return (pendingViewableModel || form.viewableModel) ? 'ink' : 'hatch'
            case 'digital':
                return ((form.paidAssets?.length || 0) + pendingModels.length) > 0 ? 'ink' : 'hatch'
            case 'print':
                return form.printConfig ? 'ink' : 'hatch'
            case 'delivery':
                return (form.delivery?.deliveryTypes?.length || 0) > 0 ? 'ink' : 'hatch'
            case 'pricing': {
                const amt = form.basePrice?.presentmentAmount
                return amt !== '' && amt !== undefined && amt !== null ? 'ink' : 'hatch'
            }
            case 'variants':
                return (form.variantTypes?.length || 0) > 0 ? 'ink' : 'hatch'
            case 'discounts':
                return form.showDiscount && ((form.discounts?.length || 0) > 0) ? 'ink' : 'hatch'
            case 'stock':
                return form.infiniteStock || (form.stock !== '' && form.stock !== undefined && form.stock !== null) ? 'ink' : 'hatch'
            default:
                return 'hatch'
        }
    }

    // Submit handler
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isLoaded) return;

        // Clear previous validation errors
        setMissingFields([]);
        setErrorSections([]);

        // Validate required fields (matching backend requirements)
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

            // Rail dots turn bad (derived from missingFields); scroll to the
            // first offending section in document order (§5.5 — nothing is
            // collapsed anymore, so no section auto-open).
            const badKeys = requiredFieldsCheck.map((f) => FIELD_TO_SECTION[f]).filter(Boolean)
            const first = firstBadSection(badKeys)
            if (first) scrollToSection(first)

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
        const errSecs = new Set();
        const addError = (msg, section) => {
            validationErrors.push(msg);
            errSecs.add(section);
        };

        // Numeric validations
        const baseAmount = typeof form.basePrice?.presentmentAmount === 'number'
            ? form.basePrice.presentmentAmount
            : Number(form.basePrice?.presentmentAmount);
        if (!Number.isNaN(baseAmount) && baseAmount < 0) {
            addError('Base price cannot be negative.', 'pricing');
        }

        const creditsAmount = typeof form.priceCredits === 'number'
            ? form.priceCredits
            : Number(form.priceCredits);
        if (!Number.isNaN(creditsAmount) && creditsAmount < 0) {
            addError('Credit price cannot be negative.', 'pricing');
        }

        if (typeof form.stock === 'number' && form.stock < 0) {
            addError('Stock cannot be negative.', 'stock');
        }

        const dims = form.dimensions || {};
        if (
            (typeof dims.length === 'number' && dims.length < 0) ||
            (typeof dims.width === 'number' && dims.width < 0) ||
            (typeof dims.height === 'number' && dims.height < 0) ||
            (typeof dims.weight === 'number' && dims.weight < 0)
        ) {
            addError('Dimensions must be zero or positive values.', 'delivery');
        }

        // Discount validations (support stacked discounts)
        if (form.showDiscount) {
            const rules = Array.isArray(form.discounts) && form.discounts.length > 0
                ? form.discounts
                : [form.discount || {}];

            for (const rule of rules) {
                const hasEvent = !!rule.eventId;
                const percentage = Number(rule.percentage);
                const minimumPrice = Number(rule.minimumPrice);
                const startDate = rule.startDate ? new Date(rule.startDate) : null;
                const endDate = rule.endDate ? new Date(rule.endDate) : null;

                if (!hasEvent && (Number.isNaN(percentage) || percentage <= 0 || percentage > 100)) {
                    addError('Each discount needs a percentage between 1 and 100%, or be linked to an event.', 'discounts');
                }

                if (!hasEvent && !Number.isNaN(minimumPrice) && minimumPrice < 0) {
                    addError('Minimum amount for any discount cannot be negative.', 'discounts');
                }

                if (!hasEvent && startDate && endDate && startDate > endDate) {
                    addError('For each discount, the start date must be before the end date.', 'discounts');
                }
            }
        }

        // Delivery type validations
        const hasPaidAssets = (Array.isArray(form.paidAssets) && form.paidAssets.length > 0) || pendingModels.length > 0;
        const hasDigitalDelivery = form.delivery?.deliveryTypes?.some(dt => dt.type === 'digital' || dt === 'digital');

        if (!hasDeliveryTypes) {
            addError('Select at least one delivery type.', 'delivery');
        }

        if (hasPaidAssets && !hasDigitalDelivery) {
            addError('Products with downloadable files must include digital delivery.', 'delivery');
        }

        // If digital delivery is selected, enforce a single variant configuration
        if (hasDigitalDelivery) {
            if (form.variantTypes?.length > 1) {
                addError('Digital products support only one variant type.', 'variants');
            }
            if (form.variantTypes?.[0]?.options && form.variantTypes[0].options.length > 1) {
                addError('Digital products support only one variant option.', 'variants');
            }
        }

        if (validationErrors.length > 0) {
            // Rail dots turn bad + first offending section scrolled to + ONE
            // summarizing toast.
            const secKeys = [...errSecs]
            setErrorSections(secKeys);
            const first = firstBadSection(secKeys)
            if (first) scrollToSection(first)

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

            // Log S3 URLs for reference
            console.log('[ProductForm] Uploaded model S3 keys:', uploadedModels);
            console.log('[ProductForm] Uploaded viewable model S3 key:', uploadedViewable);
        } catch (error) {
            console.error("Error uploading files:", error, error?.stack || '');

            // Cleanup any uploaded files
            if (allUploadedFiles.length > 0) {
                showToast("Upload failed. Cleaning up uploaded files...", "error");
                try {
                    await cleanupUploadedFiles(allUploadedFiles);
                } catch (cleanupError) {
                    console.error("Cleanup failed:", cleanupError, cleanupError?.stack || '');
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

                    // Rail dots + scroll to the most relevant section
                    const badKeys = missing.map((f) => FIELD_TO_SECTION[f]).filter(Boolean)
                    const first = firstBadSection(badKeys)
                    if (first) scrollToSection(first)

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
            setLastSavedAt(new Date());
            setDirtySinceSave(false);
            if (imageInputRef.current) imageInputRef.current.value = "";
            if (modelInputRef.current) modelInputRef.current.value = "";
            if (viewableModelInputRef.current) viewableModelInputRef.current.value = "";
            showToast(isEditing ? "Product updated successfully!" : "Product created successfully!", 'success');
            if (!isEditing) {
                setFormRaw({ ...defaultForm });
            } else {
                // Update form state with newly uploaded files so subsequent saves don't lose them
                setFormRaw(prev => ({
                    ...prev,
                    images: [...prev.images, ...uploadedImages],
                    paidAssets: [...prev.paidAssets, ...uploadedModels],
                    viewableModel: uploadedViewable ? uploadedViewable : prev.viewableModel,
                }));
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

            setFormRaw(prev => ({
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
                setFormRaw(prev => ({
                    ...prev,
                    delivery: {
                        ...(prev.delivery || {}),
                        deliveryTypes: []
                    }
                }));
            }
        }
    }, [form.paidAssets, pendingModels]);


    // Delete flows through ConfirmDialog (window.confirm is banned in
    // dashboards — §4.10); on success we navigate back to the products list.
    const handleDelete = async () => {
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
                setConfirmDeleteOpen(false);
                router.push('/dashboard/products');
                return;
            }
        } catch (err) {
            showToast("Network error: " + err.message, "error");
        }
        setDeleting(false);
        setConfirmDeleteOpen(false);
    }

    const isEditMode = !!(product && product._id);
    const ctaLabel = formattedMode === 'Create' ? 'Create Product' : 'Save Product';
    const saveStateLabel = isLoading
        ? 'Saving…'
        : lastSavedAt && !dirtySinceSave
            ? `● Saved ${lastSavedAt.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false })}`
            : 'Editing…';

    const railLink = (s, compact = false) => (
        <button
            type="button"
            key={s.key}
            data-section={s.key}
            onClick={() => scrollToSection(s.key)}
            className={`dash-hoverable flex items-center gap-2 text-left text-[13px] rounded-full cursor-pointer whitespace-nowrap ${compact ? 'px-3 py-1' : 'px-2.5 py-1'} ${
                activeSection === s.key
                    ? 'bg-[var(--dash-sun-soft)] text-[var(--dash-ink)] font-medium'
                    : 'text-[var(--dash-ink-soft)] hover:text-[var(--dash-ink)]'
            }`}
        >
            <RailDot tone={sectionTone(s.key)} />
            {s.label}
        </button>
    )

    const statusRow = (
        <div className="flex items-center justify-between gap-2">
            <span className={labelCls}>Status</span>
            <button
                type="button"
                onClick={() => setForm(f => ({ ...f, hidden: !f.hidden }))}
                title={form.hidden ? 'Unhide product (takes effect on save)' : 'Hide product from store (takes effect on save)'}
                className="cursor-pointer"
            >
                <StatusPill tone={form.hidden ? 'hatch' : 'ok'}>{form.hidden ? 'Hidden' : 'Live'}</StatusPill>
            </button>
        </div>
    )

    return (
        <>
            <form onSubmit={handleSubmit} className="w-full">
                <GlassBar className="justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                        <Link
                            href='/dashboard/products'
                            className="flex items-center gap-1 text-[13px] text-[var(--dash-ink-soft)] hover:text-[var(--dash-ink)] shrink-0"
                        >
                            <GoChevronLeft aria-hidden="true" /> Products
                        </Link>
                        <span aria-hidden="true" className="text-[var(--dash-line)]">/</span>
                        <span className="dash-section truncate">{form.name?.trim() || 'Untitled product'}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <motion.span
                            key={saveStateLabel}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={swap}
                            className="dash-data text-[var(--dash-ink-soft)] hidden sm:block"
                        >
                            {saveStateLabel}
                        </motion.span>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="dash-hoverable rounded-full px-4 py-2 text-[13px] font-medium bg-[var(--dash-sun)] text-[var(--dash-ink)] cursor-pointer hover:bg-[var(--dash-sun-deep)] active:scale-[0.97] disabled:opacity-60"
                        >
                            {isLoading ? 'Saving…' : ctaLabel}
                        </button>
                    </div>
                </GlassBar>

                {/* Rail as a horizontal pill strip below the GlassBar (<1280px) */}
                <div className="xl:hidden sticky top-14 z-10 -mx-2 px-2 py-2 bg-[var(--dash-canvas)] border-b border-[var(--dash-line)] overflow-x-auto">
                    <div className="flex items-center gap-1 w-max">
                        {visibleSections.map((s) => railLink(s, true))}
                    </div>
                </div>

                <div className="flex justify-center gap-10 mt-8 w-full">
                    {/* Document column */}
                    <div className="w-full max-w-[720px] min-w-0">
                        <FormSection id="basics" title="Basics" first anchorRef={(el) => { sectionRefs.current.basics = el }}>
                            <BasicInfo form={form} handleChange={handleChange} missingFields={missingFields} />
                            <ProductTypeCategory
                                originalProduct={isEditMode ? product : null}
                                form={form}
                                setForm={setForm}
                                isAdmin={isAdmin}
                                categories={categories}
                                subcategories={subcategories}
                            />
                        </FormSection>

                        <FormSection id="photos" title="Photos" anchorRef={(el) => { sectionRefs.current.photos = el }}>
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
                        </FormSection>

                        <FormSection id="model" title="3D model" anchorRef={(el) => { sectionRefs.current.model = el }}>
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
                        </FormSection>

                        <FormSection id="digital" title="Digital files" anchorRef={(el) => { sectionRefs.current.digital = el }}>
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
                        </FormSection>

                        {form.productType === 'print' && (
                            <FormSection id="print" title="Print settings" anchorRef={(el) => { sectionRefs.current.print = el }}>
                                <PrintConfigField form={form} setForm={setForm} />
                            </FormSection>
                        )}

                        <FormSection id="delivery" title="Delivery" anchorRef={(el) => { sectionRefs.current.delivery = el }}>
                            <ShippingFields form={form} handleChange={handleChange} setForm={setForm} missingFields={missingFields} />
                        </FormSection>

                        <FormSection id="pricing" title="Pricing" anchorRef={(el) => { sectionRefs.current.pricing = el }}>
                            <PricingFields form={form} setForm={setForm} allCurrencies={allCurrencies} missingFields={missingFields} />
                        </FormSection>

                        <FormSection id="variants" title="Variants" anchorRef={(el) => { sectionRefs.current.variants = el }}>
                            <VariantTypesField
                                form={form}
                                setForm={setForm}
                                productType={form.productType}
                                printColours={adminSettings?.printColours || []}
                                isDigitalDelivery={form.delivery?.deliveryTypes?.some(dt => dt.type === 'digital' || dt === 'digital')}
                                onVariantImageUpload={async (file) => {
                                    const formData = new FormData();
                                    formData.append('files', file);
                                    const res = await fetch('/api/upload/images', { method: 'POST', body: formData });
                                    const data = await res.json();
                                    if (!res.ok) throw new Error(data.error || 'Upload failed');
                                    return data.files[0];
                                }}
                            />
                        </FormSection>

                        <FormSection id="discounts" title="Discounts" anchorRef={(el) => { sectionRefs.current.discounts = el }}>
                            <DiscountsField form={form} setForm={setForm} events={events} />
                        </FormSection>

                        <FormSection id="stock" title="Stock" anchorRef={(el) => { sectionRefs.current.stock = el }}>
                            <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={form.infiniteStock || false}
                                    onChange={(e) => setForm(f => ({ ...f, infiniteStock: e.target.checked }))}
                                    className="rounded accent-[var(--dash-ink)]"
                                />
                                Infinite Stock (never runs out)
                            </label>
                            {!form.infiniteStock && (
                                <div className="space-y-1.5">
                                    <label htmlFor="stock" className={labelCls}>Total Stock</label>
                                    <input
                                        id="stock"
                                        type="number"
                                        name="stock"
                                        min="0"
                                        value={form.stock ?? ''}
                                        onChange={(e) => setForm(f => ({ ...f, stock: e.target.value === '' ? '' : Number(e.target.value) }))}
                                        className={`${inputCls()} dash-data w-32`}
                                        placeholder="Stock quantity"
                                    />
                                    <p className="text-[13px] text-[var(--dash-ink-soft)]">Per-variant stock can be set in the Variants section.</p>
                                </div>
                            )}
                        </FormSection>
                    </div>

                    {/* Sticky side rail (≥1280px) */}
                    <aside className="hidden xl:block w-[220px] shrink-0">
                        <div className="sticky top-16 flex flex-col gap-4">
                            <span className={labelCls}>On this sheet</span>
                            <nav aria-label="Sections" className="flex flex-col gap-1 items-start">
                                {visibleSections.map((s) => railLink(s))}
                            </nav>
                            <div className="border-t border-[var(--dash-line)] pt-4 flex flex-col gap-3">
                                {statusRow}
                                <p className="text-[11px] font-medium text-[var(--dash-ink-soft)]">Status changes take effect on save.</p>
                                <button type="submit" disabled={isLoading} className={`${quietBtnCls} w-full`}>
                                    {isLoading ? 'Saving…' : ctaLabel}
                                </button>
                                {isEditMode && (
                                    <button
                                        type="button"
                                        className={`${badTextBtnCls} text-left w-fit`}
                                        disabled={deleting}
                                        onClick={() => setConfirmDeleteOpen(true)}
                                    >
                                        {deleting ? 'Deleting…' : 'Delete product'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </aside>
                </div>

                {/* Status / delete cluster for smaller screens (rail hidden) */}
                <div className="xl:hidden mt-4 mx-auto w-full max-w-[720px] flex items-center justify-between gap-4 border-t border-[var(--dash-line)] pt-4">
                    {statusRow}
                    {isEditMode && (
                        <button
                            type="button"
                            className={badTextBtnCls}
                            disabled={deleting}
                            onClick={() => setConfirmDeleteOpen(true)}
                        >
                            {deleting ? 'Deleting…' : 'Delete product'}
                        </button>
                    )}
                </div>
            </form>

            <ConfirmDialog
                open={confirmDeleteOpen}
                onClose={() => setConfirmDeleteOpen(false)}
                onConfirm={handleDelete}
                title="Delete this product?"
                body="This permanently removes the product from your store. This action cannot be undone."
                confirmLabel="Delete Product"
                tone="bad"
                busy={deleting}
            />
        </>
    )
}

export default ProductForm
