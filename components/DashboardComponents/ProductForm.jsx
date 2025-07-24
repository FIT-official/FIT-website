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
        presentmentAmount: 0,
        presentmentCurrency: "SGD",
        priceCredits: "",
        stock: 1,
        variants: [],
        variantInput: "",
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

    const categories = form.productType === "shop" ? SHOP_CATEGORIES : PRINT_CATEGORIES
    const subcategories = form.productType === "shop" ? SHOP_SUBCATEGORIES : PRINT_SUBCATEGORIES

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
            presentmentAmount: product.price?.presentmentAmount ?? "",
            presentmentCurrency: product.price?.presentmentCurrency ?? "SGD",
            images: product.images || [],
            paidAssets: product.paidAssets || [],
            deliveryTypes,
            pickupLocation,
            royaltyFees,
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

    const handleImageChange = (e) => {
        setPendingImages(prev => [...prev, ...Array.from(e.target.files)]);
    };

    const handleRemoveImage = idx => {
        if (idx < (form.images?.length || 0)) {
            setForm(f => ({
                ...f,
                images: f.images.filter((_, i) => i !== idx)
            }));
        } else {
            setPendingImages(pendingImages => pendingImages.filter((_, i) => i !== (idx - (form.images?.length || 0))));
        }
        if (imageInputRef.current) {
            imageInputRef.current.value = "";
        }
    };

    // models (paid assets)

    const handleModelChange = (e) => {
        setPendingModels(prev => [...prev, ...Array.from(e.target.files)]);
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
    };

    // viewable model

    const handleViewableModelChange = (e) => {
        setPendingViewableModel(e.target.files[0]);
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
    }

    // variants

    const handleAddVariant = (e) => {
        e.preventDefault();
        const value = form.variantInput.trim();
        if (value && !form.variants.includes(value)) {
            setForm(f => ({
                ...f,
                variants: [...f.variants, value],
                variantInput: ""
            }));
        }
    };

    const handleRemoveVariant = (idx) => {
        setForm(f => ({
            ...f,
            variants: f.variants.filter((_, i) => i !== idx)
        }));
    };

    //submit

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isLoaded) return;
        setIsLoading(true);
        let uploadedImages
        let uploadedModels
        let uploadedViewable

        try {
            uploadedImages = await uploadImages(pendingImages);
            uploadedModels = await uploadModels(pendingModels);
            uploadedViewable = await uploadViewable(pendingViewableModel);
        } catch (error) {
            console.error("Error upisLoading files:", error);
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
            price: {
                presentmentCurrency: form.presentmentCurrency,
                presentmentAmount: Number(form.presentmentAmount),
            },
            priceCredits: Number(form.priceCredits),
            stock: Number(form.stock),
            productType: form.productType,
            category: Number(form.category),
            subcategory: Number(form.subcategory),
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
        window.location.reload()
    }

    useEffect(() => {
        if (form.deliveryTypes.digital && form.variants.length > 1) {
            setForm(f => ({
                ...f,
                variants: f.variants.slice(0, 1),
                variantInput: "",
                stock: null,
                deliveryTypes: {
                    digital: true,
                    selfCollect: false,
                    singpost: false,
                    privateDelivery: false,
                },
            }));
        }
    }, [form.deliveryTypes.digital, form.variants.length]);


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
                        <div className=" flex gap-2 flex-wrap">
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
                                            isLoading="lazy"
                                            width={80}
                                            height={80}
                                            quality={20}
                                            className="w-20 h-20 object-cover rounded-sm border border-borderColor"
                                        />
                                        <RxCross1
                                            className="absolute top-1 right-1 cursor-pointer p-0.5"
                                            size={14}
                                            onClick={() => handleRemoveImage(idx)}
                                        />
                                    </div>
                                );
                            })}
                            <label
                                className={`w-20 h-20 flex items-center justify-center rounded-sm border border-dashed border-borderColor text-extraLight
                            ${form.images.length >= 7 ? "opacity-60 cursor-not-allowed " : "cursor-pointer"}
                        `}
                                style={{ minWidth: 80, minHeight: 80 }}
                            >
                                {form.images.length >= 7 ? (
                                    <span className="text-[10px] text-center px-1">MAX PHOTOS</span>
                                ) : (
                                    <BsPlus className="text-2xl pointer-events-none" />
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
                            </label>
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
                        options={categories.map((cat, idx) => ({ value: idx, label: cat }))}
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
                        options={subcategories[form.category].map((sub, idx) => ({ value: idx, label: sub }))}
                    />

                    {/* viewable model only .glb or .gltf */}
                    <div className='flex flex-col gap-2 w-full'>
                        <label className="formLabel">Viewable Model</label>
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
                                    setPendingViewableModel(e.dataTransfer.files[0]);
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
                                    setPendingModels(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
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
                                    onChange={e =>
                                        setForm(f => ({
                                            ...f,
                                            deliveryTypes: {
                                                ...f.deliveryTypes,
                                                digital: e.target.checked
                                            }
                                        }))
                                    }
                                />
                                <label htmlFor="digital">Digital Product</label>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="selfCollect"
                                    name="selfCollect"
                                    checked={form.deliveryTypes.selfCollect}
                                    onChange={e =>
                                        setForm(f => ({
                                            ...f,
                                            deliveryTypes: {
                                                ...f.deliveryTypes,
                                                selfCollect: e.target.checked
                                            }
                                        }))
                                    }
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
                                    onChange={e =>
                                        setForm(f => ({
                                            ...f,
                                            deliveryTypes: {
                                                ...f.deliveryTypes,
                                                singpost: e.target.checked
                                            }
                                        }))
                                    }
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
                                    onChange={e =>
                                        setForm(f => ({
                                            ...f,
                                            deliveryTypes: {
                                                ...f.deliveryTypes,
                                                privateDelivery: e.target.checked
                                            }
                                        }))
                                    }
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
                    {/* product variants */}
                    <div className="flex flex-col gap-2 w-full">
                        <label className="formLabel">Product Variants / Tags</label>
                        <div className="flex gap-2 items-center">
                            <input
                                type="text"
                                name="variantInput"
                                value={form.variantInput}
                                onChange={handleChange}
                                className="formInput"
                                placeholder="Add a variant or tag and press Enter"
                                maxLength={200}
                                onKeyDown={e => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleAddVariant(e);
                                    }
                                }}
                            />
                            <button
                                type="button"
                                className="formBlackButton"
                                disabled={!form.variantInput.trim()}
                                onClick={handleAddVariant}
                            >
                                Add
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-1">
                            {form.variants.map((variant, idx) => (
                                <span
                                    key={variant}
                                    className="flex items-center border border-borderColor rounded-sm px-2 py-1 text-sm"
                                >
                                    {variant}
                                    <RxCross1
                                        className="ml-2 cursor-pointer text-lightColor"
                                        size={12}
                                        onClick={() => handleRemoveVariant(idx)}
                                    />
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* product price */}
                    <div className="flex flex-col gap-2 w-full">
                        <label className="formLabel">Product Price</label>
                        <div className="flex gap-1 items-center">
                            <div className="flex flex-1/5">
                                <SelectField
                                    onChangeFunction={handleChange}
                                    value={form.presentmentCurrency}
                                    name="presentmentCurrency"
                                    label=""
                                    options={allCurrencies.map(code => ({ value: code, label: code }))}
                                />
                            </div>
                            <div className="flex flex-4/5">
                                <input
                                    id="presentmentAmount"
                                    name="presentmentAmount"
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={form.presentmentAmount}
                                    onChange={handleChange}
                                    className="formInput"
                                    placeholder="Enter price"
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    {/* product price in credits */}
                    <div className="flex flex-col gap-2 w-full">
                        <label className="formLabel">Product Price (Credits)</label>
                        <input
                            id="priceCredits"
                            name="priceCredits"
                            type="number"
                            min={0}
                            value={form.priceCredits}
                            onChange={handleChange}
                            step="0.01"
                            className="formInput"
                            placeholder="Enter price in credits"
                            required
                        />
                    </div>

                    {/* product stock */}
                    <div className="flex flex-col gap-2 w-full">
                        <label className="formLabel">Stock</label>
                        <input
                            id="stock"
                            name="stock"
                            type="number"
                            value={form.stock ?? 1}
                            onChange={handleChange}
                            min={1}
                            step="1"
                            className="formInput"
                            placeholder="Enter stock quantity"
                            disabled={form.deliveryTypes.digital} // disable if digital is checked
                        />
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
                <button type="submit" className="formBlackButton w-full">
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