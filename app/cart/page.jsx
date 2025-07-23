'use client'
import React, { use, useEffect, useState } from 'react'
import { useUser } from "@clerk/nextjs"
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { GoChevronLeft } from 'react-icons/go';
import Image from 'next/image';
import { useToast } from '@/components/General/ToastProvider';
import CartSummarySkeleton from './components/CartSummarySkeleton';
import CartItemSkeleton from './components/CartItemSkeleton';
import { IoCartOutline } from 'react-icons/io5';
import { convertToGlobalCurrency } from '@/utils/convertCurrency';
import { getDiscountedPrice } from '@/utils/discount';
import { useCurrency } from '@/components/General/CurrencyContext';

function Cart() {
    const { user, isLoaded } = useUser();
    const [cart, setCart] = useState([]);
    const [cartBreakdown, setCartBreakdown] = useState([]);
    const [products, setProducts] = useState({});
    const [convertedPrices, setConvertedPrices] = useState({});
    const [loading, setLoading] = useState(true);
    const searchParams = useSearchParams();
    const redirectUrl = searchParams.get("redirect") || "/";
    const { showToast } = useToast();
    const globalCurrency = useCurrency();

    const refreshCartBreakdown = async () => {
        setLoading(true);
        const res = await fetch('/api/checkout/breakdown');
        if (res.ok) {
            const data = await res.json();
            setCartBreakdown(data.cartBreakdown || []);
        } else {
            const data = await res.json().catch(() => ({}));
            showToast(data.error, 'error');
            setCartBreakdown([]);
        }
        setLoading(false);
    };

    useEffect(() => {
        if (!isLoaded || !user) return;
        const fetchCart = async () => {
            setLoading(true);
            const res = await fetch(`/api/user/cart`);
            const data = await res.json();
            setCart(data.cart || []);
            const productIds = (data.cart || []).map(item => item.productId);
            if (productIds.length > 0) {
                const res2 = await fetch(`/api/product?ids=${productIds.join(",")}`);
                const data2 = await res2.json();
                const prodMap = {};
                (data2.products || []).forEach(p => { prodMap[p._id] = p; });
                setProducts(prodMap);
            }
            setLoading(false);
            // Fetch cart breakdown after loading cart
            if (data.cart && data.cart.length > 0) {
                refreshCartBreakdown();
            }
        };
        fetchCart();
    }, [isLoaded, user]);

    // Calculate converted prices when products or currency changes
    useEffect(() => {
        const calculateConvertedPrices = async () => {
            const newConvertedPrices = {};

            for (const productId of Object.keys(products)) {
                const product = products[productId];
                const price = product.price.presentmentAmount;
                const currency = product.price.presentmentCurrency;
                const discountedPrice = getDiscountedPrice(product);

                try {
                    const convertedPrice = await convertToGlobalCurrency(price, currency, globalCurrency);
                    const convertedDiscountedPrice = discountedPrice
                        ? await convertToGlobalCurrency(discountedPrice, currency, globalCurrency)
                        : null;

                    newConvertedPrices[productId] = {
                        price: convertedPrice,
                        discountedPrice: convertedDiscountedPrice,
                        currency: globalCurrency
                    };
                } catch (error) {
                    console.error('Error converting price for product', productId, error);
                    // Fallback to original price
                    newConvertedPrices[productId] = {
                        price: price,
                        discountedPrice: discountedPrice,
                        currency: currency
                    };
                }
            }

            setConvertedPrices(newConvertedPrices);
        };

        if (Object.keys(products).length > 0 && globalCurrency) {
            calculateConvertedPrices();
        }
    }, [products, globalCurrency]);

    const handleDeliveryChange = async (cartItem, newType) => {
        setLoading(true);
        const res = await fetch("/api/user/cart/delivery", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                productId: cartItem.productId,
                variantId: cartItem.variantId || null,
                chosenDeliveryType: newType,
            }),
        });
        setLoading(false);
        if (res.ok) {
            const cartRes = await fetch(`/api/user/cart`);
            const cartData = await cartRes.json();
            setCart(cartData.cart || []);
            refreshCartBreakdown();
        }
    };

    const handleRemove = async (cartItem) => {
        setLoading(true);
        const res = await fetch("/api/user/cart", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                productId: cartItem.productId,
                variantId: cartItem.variantId || null,
            }),
        });
        setLoading(false);
        if (res.ok) {
            setCart(cart =>
                cart.filter(item =>
                    !(item.productId === cartItem.productId && item.variantId === cartItem.variantId)
                )
            );
            refreshCartBreakdown();
        }
    };

    const handleChangeQuantity = async (cartItem, delta) => {
        setLoading(true);
        if (delta === 1) {
            const res = await fetch("/api/user/cart", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    cartItem: {
                        productId: cartItem.productId,
                        quantity: 1,
                        variantId: cartItem.variantId || null,
                        chosenDeliveryType: cartItem.chosenDeliveryType,
                    }
                }),
            });
            setLoading(false);
            if (res.ok) {
                setCart(cart =>
                    cart.map(item =>
                        item.productId === cartItem.productId &&
                            item.variantId === cartItem.variantId &&
                            item.chosenDeliveryType === cartItem.chosenDeliveryType
                            ? { ...item, quantity: item.quantity + 1 }
                            : item
                    )
                );
                refreshCartBreakdown();
            }
        } else if (delta === -1) {
            if (cartItem.quantity <= 1) {
                await handleRemove(cartItem);
                setLoading(false);
                return;
            }
            const res = await fetch("/api/user/cart", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    cartItem: {
                        productId: cartItem.productId,
                        quantity: -1,
                        variantId: cartItem.variantId || null,
                        chosenDeliveryType: cartItem.chosenDeliveryType,
                    }
                }),
            });
            setLoading(false);
            if (res.ok) {
                setCart(cart =>
                    cart.map(item =>
                        item.productId === cartItem.productId &&
                            item.variantId === cartItem.variantId &&
                            item.chosenDeliveryType === cartItem.chosenDeliveryType
                            ? { ...item, quantity: item.quantity - 1 }
                            : item
                    )
                );
                refreshCartBreakdown();
            }
        }
    };

    return (
        <div className='flex w-full flex-col min-h-[92vh] py-12 border-b border-borderColor px-8'>
            <Link href={redirectUrl} className='flex w-full items-center text-sm font-normal gap-2 toggleXbutton'>
                <GoChevronLeft /> Go Back
            </Link>
            <h2 className='flex items-center gap-2 ml-5 mb-2 mt-4 font-semibold text-3xl'>
                <IoCartOutline />
                Your Cart
            </h2>
            <div className='flex flex-col w-full py-4'>
                <div className='flex flex-col border-t border-b w-full my-6 divide-y divide-borderColor border-borderColor'>
                    {loading ? (
                        <>
                            <CartItemSkeleton />
                            <CartItemSkeleton />
                        </>
                    ) :
                        cart.length > 0 ? (
                            cart.map((cartItem, index) => {
                                const product = products[cartItem.productId];
                                if (!product) return null;
                                return (
                                    <div key={index} className='grid grid-cols-1 md:grid-rows-1 md:grid-cols-5 gap-2 md:gap-4 py-8 md:py-6 px-6'>
                                        {/* image */}
                                        <div className='flex w-full h-full items-center justify-start'>
                                            <Image
                                                src={`/api/proxy?key=${encodeURIComponent(product.images[0])}`}
                                                alt={product.name}
                                                width={64}
                                                height={64}
                                                className='w-24 md:w-16 md:h-16 aspect-square object-cover flex'
                                            />
                                        </div>

                                        {/* details */}
                                        <div className='flex w-full items-start justify-center flex-col gap-1'>
                                            <p className='flex font-bold uppercase md:text-sm'>{product.name}</p>
                                            <div className='flex w-fit'>
                                                <span className="text-xs text-lightColor">
                                                    {product.variants && cartItem.variantId
                                                        ? (product.variants.find(v =>
                                                            v._id === cartItem.variantId || v === cartItem.variantId // support both object and string
                                                        )?.name || String(cartItem.variantId))
                                                        : "Default"}
                                                </span>
                                            </div>
                                        </div>

                                        {/* delivery */}
                                        <div className='flex items-center md:justify-center'>
                                            <select
                                                value={cartItem.chosenDeliveryType}
                                                onChange={e => handleDeliveryChange(cartItem, e.target.value)}
                                                className="py-1 px-2 rounded border border-borderColor bg-background md:text-xs text-lightColor focus:outline-none appearance-none transition-all cursor-pointer"
                                                style={{ minWidth: 80, maxWidth: 120 }}
                                                aria-label="Change delivery type"
                                                disabled={loading}
                                            >
                                                {(product.delivery?.deliveryTypes || []).map(dt => (
                                                    <option key={dt.type} value={dt.type}>
                                                        {dt.type}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* quantity */}
                                        <div className='flex items-center md:justify-center text-sm font-medium '>
                                            <div className='flex flex-row rounded border border-borderColor py-1'>
                                                <button
                                                    onClick={() => handleChangeQuantity(cartItem, 1)}
                                                    disabled={loading || cartItem.chosenDeliveryType === "digital"}
                                                    className="px-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    aria-label="Increase quantity"
                                                >
                                                    +
                                                </button>
                                                <div className=''>
                                                    {cartItem.chosenDeliveryType === "digital" ? 1 : cartItem.quantity}
                                                </div>
                                                <button
                                                    onClick={() => handleChangeQuantity(cartItem, -1)}
                                                    disabled={loading || cartItem.chosenDeliveryType === "digital"}
                                                    className="px-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    aria-label="Decrease quantity"
                                                >
                                                    -
                                                </button>
                                            </div>
                                        </div>

                                        {/* price */}
                                        <div className='flex flex-col justify-center items-end font-semibold md:text-sm text-base'>
                                            {(() => {
                                                const convertedPriceData = convertedPrices[product._id];
                                                if (!convertedPriceData) {
                                                    // Fallback to original price if conversion not ready
                                                    const price = product.price.presentmentAmount;
                                                    const currency = product.price.presentmentCurrency;
                                                    const discountedPrice = getDiscountedPrice(product);

                                                    return (
                                                        <>
                                                            {discountedPrice ? (
                                                                <>
                                                                    <span className="font-bold">
                                                                        {currency} {Number(discountedPrice * cartItem.quantity).toFixed(2)}
                                                                    </span>
                                                                    <div className="text-xs text-extraLight md:text-[10px]font-semibold">
                                                                        {product.discount.percentage}% off!
                                                                    </div>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <span>
                                                                        {currency} {Number(price * cartItem.quantity).toFixed(2)}
                                                                    </span>
                                                                </>
                                                            )}
                                                            <div className='text-xs md:text-[10px] text-lightColor font-medium'>
                                                                {currency} {discountedPrice
                                                                    ? Number(discountedPrice).toFixed(2)
                                                                    : Number(price).toFixed(2)
                                                                } per unit
                                                            </div>
                                                        </>
                                                    );
                                                }

                                                const { price: convertedPrice, discountedPrice: convertedDiscountedPrice, currency } = convertedPriceData;
                                                const hasDiscount = convertedDiscountedPrice !== null;

                                                return (
                                                    <>
                                                        {hasDiscount ? (
                                                            <>
                                                                <span className="font-bold">
                                                                    {currency} {Number(convertedDiscountedPrice * cartItem.quantity).toFixed(2)}
                                                                </span>
                                                                <div className="text-xs text-extraLight md:text-[10px]font-semibold">
                                                                    {product.discount.percentage}% off!
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span>
                                                                    {currency} {Number(convertedPrice * cartItem.quantity).toFixed(2)}
                                                                </span>
                                                            </>
                                                        )}
                                                        {/* Per-unit price below */}
                                                        <div className='text-xs md:text-[10px] text-lightColor font-medium'>
                                                            {currency} {hasDiscount
                                                                ? Number(convertedDiscountedPrice).toFixed(2)
                                                                : Number(convertedPrice).toFixed(2)
                                                            } per unit
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className='flex w-full items-center justify-center p-6 text-lightColor text-xs uppercase font-normal'>
                                No items in cart.
                            </div>
                        )
                    }

                </div>

                <div className='flex w-full justify-end mt-8'>
                    <div className='flex flex-col border border-borderColor rounded p-4 w-full md:w-fit min-w-1/2'>
                        <h2 className="font-semibold text-lg mb-4">Cart Summary</h2>
                        {loading ? (
                            <CartSummarySkeleton />
                        ) : cartBreakdown.length === 0 ? (
                            <div className="text-lightColor text-xs mb-4">No items in cart. Did you forget to update your delivery address?</div>
                        ) : (
                            (() => {
                                // Subtotal: sum of all product prices × quantity
                                const subtotal = cartBreakdown.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
                                // Delivery fees: sum of all deliveryFee
                                const totalDeliveryFee = cartBreakdown.reduce((sum, item) => sum + (item.deliveryFee || 0), 0);
                                // Grand total: subtotal + totalDeliveryFee
                                const grandTotal = subtotal + totalDeliveryFee;
                                const currency = cartBreakdown[0]?.currency || 'SGD';
                                return (
                                    <div className="flex flex-col divide-y divide-borderColor text-xs">
                                        <div className="flex justify-between font-normal text-lightColor gap-20 py-2">
                                            <span>Subtotal</span>
                                            <span className='font-medium text-textColor text-right'>{`${currency} ${subtotal.toFixed(2)}`}</span>
                                        </div>
                                        {cartBreakdown.map((item, idx) => (
                                            <div key={idx} className="flex justify-between font-normal text-lightColor gap-20 py-2">
                                                <span>
                                                    {item.chosenDeliveryType === "digital" ? "Digital Delivery" : "Delivery Fee"} for <span>{item.name}</span>
                                                    {item.chosenDeliveryType ? ` (${item.chosenDeliveryType})` : ""}
                                                </span>
                                                <span className='font-medium text-textColor text-right'>
                                                    {`${currency} ${item.deliveryFee?.toFixed(2) ?? "0.00"}`}
                                                </span>
                                            </div>
                                        ))}
                                        <div className='py-2 flex justify-between font-bold mt-2 w-full whitespace-nowrap'>
                                            <span>Grand Total</span>
                                            <span className='text-right'>{`${currency} ${grandTotal.toFixed(2)}`}</span>
                                        </div>
                                    </div>
                                );
                            })()
                        )}
                        <Link
                            href="/checkout"
                            className={`formBlackButton mt-4${cart.length === 0 ? " opacity-60 pointer-events-none cursor-not-allowed" : ""}`}
                            tabIndex={cart.length === 0 ? -1 : 0}
                            aria-disabled={cart.length === 0}
                        >
                            Proceed to Checkout
                        </Link>
                    </div>
                </div>
            </div>

        </div>
    )
}

export default Cart