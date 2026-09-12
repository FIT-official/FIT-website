'use client'

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { GoChevronDown } from "react-icons/go";
import { AnimatePresence, motion } from "framer-motion";
import ProductCard from "@/components/ProductCard";
import { useContent } from "@/utils/useContent";
import { cataloguePrice } from '@/lib/productCatalogue';

function ShopPage({ initialProducts = [] }) {
    const products = initialProducts;
    const searchParams = useSearchParams();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [priceRange, setPriceRange] = useState(null);
    const priceCeiling = Math.max(100, ...products.map(p => Math.ceil(cataloguePrice(p))));
    const effectivePriceRange = Math.min(priceRange ?? priceCeiling, priceCeiling);
    const [sort, setSort] = useState("topRated");
    const [search, setSearch] = useState(searchParams.get('search') || "");
    const urlSearch = searchParams.get('search') || '';
    useEffect(() => { setSearch(urlSearch); }, [urlSearch]);

    const { content: bannerContent } = useContent('shop/banner', {
        bannerImage: '/placeholder.jpg'
    });

    const [bannerSrc, setBannerSrc] = useState(null);
    const [isBannerLoaded, setIsBannerLoaded] = useState(false);

    useEffect(() => {
        const bi = bannerContent?.bannerImage;
        if (!bi || bi === '/placeholder.jpg') {
            setBannerSrc('/placeholder.jpg');
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
        let filtered = products.filter(
            (p) =>
                cataloguePrice(p) <= effectivePriceRange &&
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

    const toggleDropdown = () => {
        setIsDropdownOpen((prev) => !prev);
    }

    return (
        <div className='fle flex-col w-full min-h-[92vh] border-b border-borderColor px-8'>
            <div className="mb-4 w-full mt-8">
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
                                setBannerSrc('/placeholder.jpg');
                                setIsBannerLoaded(true);
                            }}
                        />
                    )}
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
                                        max={priceCeiling}
                                        step={1}
                                        value={effectivePriceRange}
                                        onChange={e => setPriceRange(Number(e.target.value))}
                                        className="w-full accent-textColor"
                                    />
                                    <span className="text-xs mt-1">Up to ${effectivePriceRange}</span>
                                </div>
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
                    <div className="col-span-4 text-center py-8">
                        <p>No products found.</p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default ShopPage
