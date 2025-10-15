'use client'

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SHOP_CATEGORIES, SHOP_SUBCATEGORIES } from "@/lib/categories";
import Image from "next/image";
import { GoChevronDown } from "react-icons/go";
import { AnimatePresence, motion } from "framer-motion";
import ProductCard from "@/components/ProductCard";
import { useToast } from "@/components/General/ToastProvider";

function ShopPage() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const searchParams = useSearchParams();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [priceRange, setPriceRange] = useState(100);
    const [sort, setSort] = useState("topRated");
    const [search, setSearch] = useState("");
    const { showToast } = useToast();

    useEffect(() => {
        const fetchProducts = async () => {
            setLoading(true);
            const categoryName = searchParams.get('productCategory');
            const subcategoryName = searchParams.get('productSubCategory');

            let categoryIdx = null;
            let subcategoryIdx = null;

            if (categoryName) {
                categoryIdx = SHOP_CATEGORIES.findIndex(cat => cat === categoryName);
            }
            if (categoryIdx !== -1 && subcategoryName) {
                subcategoryIdx = SHOP_SUBCATEGORIES[categoryIdx]?.findIndex(sub => sub === subcategoryName);
            }

            let url = "/api/product?productType=shop";
            if (categoryIdx !== null && categoryIdx !== -1) url += `&productCategory=${categoryIdx}`;
            if (subcategoryIdx !== null && subcategoryIdx !== -1) url += `&productSubCategory=${subcategoryIdx}`;
            url += "&fields=_id,name,images,discount,slug,sales,reviews,variants,likes,creatorUserId,basePrice,variantTypes";

            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok) {
                showToast('Failed to fetch products', 'error');
            } else {
                setProducts(data.products);
            }
            setLoading(false);
        };

        fetchProducts();
    }, [searchParams]);

    const filteredProducts = useMemo(() => {
        let filtered = products.filter(
            (p) =>
                (!p.price?.presentmentAmount ||
                    Number(p.price.presentmentAmount) <= priceRange) &&
                (
                    !search ||
                    p.name?.toLowerCase().includes(search.toLowerCase()) ||
                    p.description?.toLowerCase().includes(search.toLowerCase())
                )
        );

        switch (sort) {
            case "topRated":
                filtered = filtered.slice().sort((a, b) => {
                    const aRating = a.reviews?.length
                        ? a.reviews.reduce((acc, r) => acc + r.rating, 0) / a.reviews.length
                        : 0;
                    const bRating = b.reviews?.length
                        ? b.reviews.reduce((acc, r) => acc + r.rating, 0) / b.reviews.length
                        : 0;
                    return bRating - aRating;
                });
                break;
            case "sales":
                filtered = filtered.slice().sort((a, b) => (b.sales?.length || 0) - (a.sales?.length || 0));
                break;
            case "newest":
                filtered = filtered.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                break;
            case "priceHigh":
                filtered = filtered.slice().sort((a, b) => (b.price?.presentmentAmount || 0) - (a.price?.presentmentAmount || 0));
                break;
            case "priceLow":
                filtered = filtered.slice().sort((a, b) => (a.price?.presentmentAmount || 0) - (b.price?.presentmentAmount || 0));
                break;
            default:
                break;
        }
        return filtered;
    }, [products, sort, priceRange, search]);

    const toggleDropdown = () => {
        setIsDropdownOpen((prev) => !prev);
    }

    return (
        <div className='fle flex-col w-full min-h-[92vh] border-b border-borderColor px-8'>
            <div className="mb-4 w-full mt-8 grayscale-60">
                <div className="relative aspect-[16/5] w-full">
                    <Image
                        src="/placeholder.jpg"
                        alt="Banner"
                        fill
                        className="object-cover"
                        priority
                        sizes="100vw"
                    />
                </div>
            </div>

            <div className='flex justify-between w-full border border-borderColor p-2 rounded-lg bg-baseColor mb-4'>
                <input
                    className='flex w-full px-2 focus:outline-none font-normal'
                    type='text'
                    placeholder='Search products...'
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <div className='flex relative items-center gap-4'>
                    <button onClick={toggleDropdown} className='flex items-center py-1 pl-4 pr-2 bg-textColor text-background rounded-sm font-normal cursor-pointer'>
                        Filter
                        <GoChevronDown className='ml-2' size={20} />
                    </button>
                    <AnimatePresence>
                        {isDropdownOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: -16, height: 0 }}
                                animate={{ opacity: 1, y: 0, height: "auto" }}
                                exit={{ opacity: 0, y: -16, height: 0 }}
                                transition={{ duration: 0.25, ease: "easeInOut" }}
                                className="absolute right-0 top-12 bg-bgColor border border-borderColor bg-background rounded-lg min-w-64 min-h-40 shadow-lg z-10 overflow-hidden flex flex-col divide-y divide-borderColor items-center justify-center"
                            >
                                <div
                                    className="dropdownSortItem w-full px-4 py-2 cursor-pointer hover:bg-baseColor"
                                    onClick={() => {
                                        setSort("topRated");
                                        setIsDropdownOpen(false);
                                    }}
                                >
                                    Top Rated
                                </div>
                                <div
                                    className="dropdownSortItem w-full px-4 py-2 cursor-pointer hover:bg-baseColor"
                                    onClick={() => {
                                        setSort("sales");
                                        setIsDropdownOpen(false);
                                    }}
                                >
                                    Sales
                                </div>
                                <div
                                    className="dropdownSortItem w-full px-4 py-2 cursor-pointer hover:bg-baseColor"
                                    onClick={() => {
                                        setSort("newest");
                                        setIsDropdownOpen(false);
                                    }}
                                >
                                    Newest
                                </div>
                                <div
                                    className="dropdownSortItem w-full px-4 py-2 cursor-pointer hover:bg-baseColor"
                                    onClick={() => {
                                        setSort("priceHigh");
                                        setIsDropdownOpen(false);
                                    }}
                                >
                                    Price: High to Low
                                </div>
                                <div
                                    className="dropdownSortItem w-full px-4 py-2 cursor-pointer hover:bg-baseColor"
                                    onClick={() => {
                                        setSort("priceLow");
                                        setIsDropdownOpen(false);
                                    }}
                                >
                                    Price: Low to High
                                </div>
                                <div className="dropdownSortItem w-full px-4 py-2 flex flex-col items-center">
                                    <span className="mb-2">Price Range</span>
                                    <input
                                        type="range"
                                        min={0}
                                        max={100}
                                        step={1}
                                        value={priceRange}
                                        onChange={e => setPriceRange(Number(e.target.value))}
                                        className="w-full accent-textColor"
                                    />
                                    <span className="text-xs mt-1">Up to ${priceRange}</span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div className="grid w-full lg:grid-cols-4 md:grid-cols-2 grid-cols-1 gap-6">
                {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <div
                            key={i}
                            className="relative flex flex-col gap-3 p-4 animate-pulse"
                        >
                            <div className="w-full aspect-square bg-borderColor mb-2" />
                            <div className="flex flex-col w-full items-center justify-center relative gap-2">
                                <div className="h-4 w-1/2 bg-borderColor  mb-1" />
                                <div className="h-6 w-1/3 bg-borderColor  mb-2" />
                            </div>
                        </div>
                    ))
                ) : filteredProducts.length > 0 ? (
                    filteredProducts.map((product) => (
                        <ProductCard key={product._id || product.id} product={product} />
                    ))
                ) : (
                    <div className="col-span-4 text-center py-8">
                        <p>No products found.</p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default ShopPage