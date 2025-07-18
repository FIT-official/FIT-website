'use client'
import { useEffect, useState } from 'react';
import { IoIosCheckmark } from 'react-icons/io'
import { useToast } from '../General/ToastProvider';

function Tier({ value, priceId, setPriceId }) {
    const [productInfo, setProductInfo] = useState({
        productName: '',
        price: '',
        interval: '',
        description: '',
        features: [],
    });
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();


    useEffect(() => {
        if (!value || value === "") {
            setLoading(false);
            return
        }
        setLoading(true);
        fetch(`/api/subscription/info?priceId=${value}`)
            .then(res => res.json())
            .then(data => {
                setProductInfo({
                    productName: data.productName,
                    price: data.price,
                    interval: data.interval,
                    description: data.description,
                    features: data.features || [],
                });
                setLoading(false);
            })
            .catch(() => {
                showToast('Failed to fetch product info', 'error');
                setLoading(false);
            });

    }, [value]);

    if (loading) {
        return (
            <div className="flex flex-col px-4 py-5 rounded-lg w-full animate-pulse bg-borderColor">
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center">
                        <div className="w-4 h-4 rounded-full bg-baseColor mr-3" />
                        <div className="h-4 w-24 bg-baseColor rounded" />
                    </div>
                    <div className="h-4 w-16 bg-baseColorrounded" />
                </div>
            </div>
        );
    }

    return (
        <div className={`flex flex-col px-4 py-5 rounded-lg border w-full ${value !== '' ? 'border-none drop-shadow bg-gradient-to-br from-[#ffffff] to-[#f1f1f1]' : 'border-borderColor'}`}>
            <div className='flex items-center justify-between w-full'>
                <div className='flex items-center'>
                    <input
                        type="radio"
                        name="tier"
                        value={value}
                        checked={priceId === value}
                        onChange={() => setPriceId(value)}
                        className="mr-3 accent-textColor"
                    />
                    <label className={`flex font-medium `}>
                        {productInfo.productName || "Free Tier"}
                    </label>
                </div>
                <div className='flex font-medium items-center gap-1 mr-2'>
                    {productInfo.price ? `S$${productInfo.price}` : 'Free'}
                    {productInfo.interval && (
                        <span className='flex text-xs'>/ {productInfo.interval}</span>
                    )}
                </div>
            </div>
            <div
                className={`transition-all duration-300 ease-in-out overflow-hidden ${priceId === value ? 'max-h-96 opacity-100 mt-2 ml-6' : 'max-h-0 opacity-0'}`}
            >
                <div className='flex font-normal flex-col text-xs'>
                    {productInfo.description || "Limited access for customers"}
                    <ul className='text-lightColor mt-1'>
                        {value !== "" ? productInfo.features.map((feature, index) => (
                            <li key={index} className='flex items-center gap-1'>
                                <IoIosCheckmark size={20} />
                                {typeof feature === "string"
                                    ? feature
                                    : feature?.name || JSON.stringify(feature)}
                            </li>
                        )) : (
                            <>
                                <li className='flex items-center gap-1'>
                                    <IoIosCheckmark size={20} />
                                    Feature 1
                                </li>
                                <li className='flex items-center gap-1'>
                                    <IoIosCheckmark size={20} />
                                    Feature 2
                                </li>
                            </>
                        )}
                    </ul>
                </div>
            </div>
        </div>
    )
}

export default Tier