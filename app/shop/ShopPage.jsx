'use client'

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import { GoChevronDown } from "react-icons/go";
import { AnimatePresence, motion } from "framer-motion";
import ProductCard from "@/components/ProductCard";
import { useContent } from "@/utils/useContent";
import { useInventoryRefresh } from '@/utils/useInventoryRefresh';
import { cataloguePrice } from '@/lib/productCatalogue';

function ShopPage({ initialProducts = [] }) {
    const products = initialProducts;
    const router = useRouter();
    useInventoryRefresh(() => router.refresh());
    const searchParams = useSearchParams();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const filterRoot = useRef(null);
    const filterTrigger = useRef(null);
    const [priceRange, setPriceRange] = useState(null);
    const priceCeiling = Math.max(100, ...products.map(p => Math.ceil(cataloguePrice(p))));
    const effectivePriceRange = Math.min(priceRange ?? priceCeiling, priceCeiling);
    const [sort, setSort] = useState("topRated");
    const [search, setSearch] = useState(searchParams.get('search') || "");
    const urlSearch = searchParams.get('search') || '';
    useEffect(() => { setSearch(urlSearch); }, [urlSearch]);

    const { content: bannerContent } = useContent('shop/banner', {
        bannerImage: ''
    });

    const [bannerSrc, setBannerSrc] = useState(null);
    const [isBannerLoaded, setIsBannerLoaded] = useState(false);

    useEffect(() => {
        const bi = bannerContent?.bannerImage;
        if (!bi || bi === '/placeholder.jpg') {
            setBannerSrc(null);
            setIsBannerLoaded(false);
            return;
        }

        setIsBannerLoaded(false);
        if (bi.startsWith('http://') || bi.startsWith('https://') || bi.startsWith('/')) {
            setBannerSrc(bi);
        } else {
            setBannerSrc(`/api/proxy?key=${encodeURIComponent(bi)}`);
        }
    }, [bannerContent?.bannerImage]);

    const filteredProducts = useMemo(() => {
        const query = search.trim().toLowerCase();
        let filtered = products.filter(
            (p) =>
                cataloguePrice(p) <= effectivePriceRange &&
                (
                    !query ||
                    p.name?.toLowerCase().includes(query) ||
                    p.description?.toLowerCase().includes(query)
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
                filtered = filtered.slice().sort((a, b) => (b.salesCount ?? b.sales?.length ?? 0) - (a.salesCount ?? a.sales?.length ?? 0));
                break;
            case "newest":
                filtered = filtered.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                break;
            case "priceHigh":
                filtered = filtered.slice().sort((a, b) => cataloguePrice(b) - cataloguePrice(a));
                break;
            case "priceLow":
                filtered = filtered.slice().sort((a, b) => cataloguePrice(a) - cataloguePrice(b));
                break;
            default:
                break;
        }
        return filtered;
    }, [products, sort, effectivePriceRange, search]);

    const closeFilter = () => {
        setIsDropdownOpen(false);
        filterTrigger.current?.focus();
    };
    const hasActiveFilters = Boolean(search) || effectivePriceRange < priceCeiling;
    const clearFilters = () => {
        setSearch('');
        setPriceRange(null);
        closeFilter();
    };
    useEffect(() => {
        if (!isDropdownOpen) return;
        const outside = event => { if (!filterRoot.current?.contains(event.target)) setIsDropdownOpen(false); };
        document.addEventListener('pointerdown', outside);
        return () => document.removeEventListener('pointerdown', outside);
    }, [isDropdownOpen]);

    return (
        <div className='flex flex-col w-full min-h-[92vh] border-b border-borderColor px-8'>
            {bannerSrc && <div className="mb-4 w-full mt-8">
                <div className="relative aspect-16/5 w-full">
                    {bannerSrc && (
                        <Image
                            src={bannerSrc}
                            alt="Banner"
                            fill
                            priority
                            sizes="100vw"
                            className={`object-cover transition-all duration-500 ease-in-out ${isBannerLoaded ? 'opacity-100' : 'opacity-0'}`}
                            onLoad={() => setIsBannerLoaded(true)}
                            onError={() => {
                                setBannerSrc(null);
                                setIsBannerLoaded(false);
                            }}
                        />
                    )}
                </div>
            </div>}

            <div className='flex justify-between w-full border border-borderColor p-2 rounded-lg bg-baseColor mb-4'>
                <input
                    className='flex w-full min-w-0 px-2 focus:outline-none font-normal'
                    type='search'
                    aria-label='Search products'
                    placeholder='Search products...'
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <div ref={filterRoot} className='flex relative items-center gap-4'
                    onKeyDown={event => { if (event.key === 'Escape' && isDropdownOpen) { event.preventDefault(); closeFilter(); } }}
                    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setIsDropdownOpen(false); }}>
                    <button type="button" ref={filterTrigger} aria-expanded={isDropdownOpen} aria-controls="shop-filters" onClick={() => setIsDropdownOpen(open => !open)} className='flex items-center py-1 pl-4 pr-2 bg-textColor text-background rounded-sm font-normal cursor-pointer'>
                        Filter
                        <GoChevronDown className='ml-2' size={20} />
                    </button>
                    <AnimatePresence>
                        {isDropdownOpen && (
                            <motion.div id="shop-filters"
                                initial={{ opacity: 0, y: -16, height: 0 }}
                                animate={{ opacity: 1, y: 0, height: "auto" }}
                                exit={{ opacity: 0, y: -16, height: 0 }}
                                transition={{ duration: 0.25, ease: "easeInOut" }}
                                className="absolute right-0 top-12 bg-bgColor border border-borderColor bg-background rounded-lg min-w-64 min-h-40 shadow-lg z-10 overflow-hidden flex flex-col divide-y divide-borderColor items-center justify-center"
                            >
                                {[
                                    ['topRated', 'Top Rated'], ['sales', 'Sales'], ['newest', 'Newest'],
                                    ['priceHigh', 'Price: High to Low'], ['priceLow', 'Price: Low to High'],
                                ].map(([value, label]) => <button key={value} type="button"
                                    aria-pressed={sort === value}
                                    className="dropdownSortItem w-full px-4 py-2 text-left cursor-pointer hover:bg-baseColor focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                                    onClick={() => { setSort(value); closeFilter(); }}>
                                    {label}
                                </button>)}
                                <div className="dropdownSortItem w-full px-4 py-2 flex flex-col items-center">
                                    <label htmlFor="shop-maximum-price" className="mb-2">Maximum price</label>
                                    <input
                                        type="range"
                                        id="shop-maximum-price"
                                        aria-valuetext={`Up to SGD ${effectivePriceRange}`}
                                        min={0}
                                        max={priceCeiling}
                                        step={1}
                                        value={effectivePriceRange}
                                        onChange={e => setPriceRange(Number(e.target.value))}
                                        className="w-full accent-textColor"
                                    />
                                    <span className="text-xs mt-1">Up to ${effectivePriceRange}</span>
                                </div>
                                {hasActiveFilters && <button type="button"
                                    className="w-full px-4 py-3 text-sm underline hover:bg-baseColor"
                                    onClick={clearFilters}>
                                    Clear search and price filter
                                </button>}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div className="grid w-full lg:grid-cols-4 md:grid-cols-2 grid-cols-1 gap-6">
                {filteredProducts.length > 0 ? (
                    filteredProducts.map((product) => (
                        <ProductCard key={product._id || product.id} product={product} />
                    ))
                ) : (
                    <div className="col-span-full text-center py-8">
                        <p role="status">No products found.</p>
                        {hasActiveFilters && !isDropdownOpen && <button type="button" className="underline mt-3"
                            onClick={clearFilters}>
                            Clear search and price filter
                        </button>}
                    </div>
                )}
            </div>
        </div>
    )
}

export default ShopPage
