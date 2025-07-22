'use client'

import { useEffect, useState } from "react"
import { useToast } from "@/components/General/ToastProvider"
import Image from "next/image";
import { IoMdDownload } from "react-icons/io";
import { set } from "mongoose";
import { GoChevronLeft, GoChevronRight } from "react-icons/go";

function DownloadsSection({
    user, isLoaded
}) {
    const [myTransactions, setMyTransactions] = useState([]);
    const [loading, setLoading] = useState(false);
    const { showToast } = useToast();

    const [currentModelIdx, setCurrentModelIdx] = useState({});

    const nextModel = (transactionId, total) => {
        setCurrentModelIdx(prev => ({
            ...prev,
            [transactionId]: ((prev[transactionId] ?? 0) + 1) % total
        }));
    }
    const prevModel = (transactionId, total) => {

        setCurrentModelIdx(prev => ({
            ...prev,
            [transactionId]: ((prev[transactionId] ?? 0) - 1 + total) % total
        }));
    }

    const downloadModel = async (productId, linkIdx) => {
        if (!isLoaded || !user) {
            router.push("/sign-in?redirect=/products");
            return;
        }
        try {
            const res = await fetch(`/api/asset/download/${productId}?idx=${linkIdx}`);
            const data = await res.json();
            if (data.downloadUrl) {
                window.open(data.downloadUrl, "_blank");
            } else {
                showToast("Download link not available.", "error");
            }
        } catch (err) {
            alert("Download failed.");
        }
    }

    useEffect(() => {
        const fetchTransactions = async () => {
            try {
                const transactionsRes = await fetch('/api/asset/storage', {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });
                const transactionData = await transactionsRes.json();
                setCurrentModelIdx(transactionData.transactions.map(t => [t._id, 0]));

                const productIds = [...new Set(transactionData.transactions.map(t => t.productId))];
                const productsRes = await fetch(`/api/product?ids=${productIds.join(",")}`);
                const productsData = await productsRes.json();

                setMyTransactions(transactionData.transactions.map(transaction => {
                    const product = productsData.products.find(p =>
                        p._id === transaction.productId || p.id === transaction.productId
                    );
                    return {
                        ...transaction,
                        product
                    };
                }));

            } catch (error) {
                showToast("Failed to fetch transactions: " + error.message, "error");
            }
        }

        if (user && isLoaded) {
            setLoading(true);
            fetchTransactions();
            setLoading(false);
        }
    }, [user, isLoaded])

    return (
        <div className='flex flex-col overflow-auto'>
            <h2 className="flex font-semibold text-lg mb-2">Your Digital Purchases</h2>
            <p className="flex text-xs max-w-sm mb-6">
                Here you can download the digital assets you have purchased.
            </p>
            {loading ? (
                <div className="flex flex-col gap-4">
                    {[...Array(3)].map((_, idx) => (
                        <div
                            key={idx}
                            className="border border-borderColor rounded-lg flex flex-col md:flex-row md:justify-between px-4 py-4 md:py-1 items-end md:items-center gap-4 animate-pulse"
                        >
                            <div className="flex flex-row gap-4 items-center">
                                <div className="w-20 h-20 rounded-md bg-borderColor/10 flex-shrink-0 flex-grow-0 flex items-center justify-center overflow-hidden border border-borderColor/30">
                                    <div className="bg-gray-300 w-[80px] h-[80px] rounded" />
                                </div>
                                <div className="flex flex-col w-full max-w-xs gap-2">
                                    <div className="h-5 bg-gray-300 rounded w-3/4" />
                                    <div className="h-4 bg-gray-200 rounded w-full" />
                                </div>
                            </div>
                            <div className='flex w-full justify-between gap-1 md:gap-2 items-center'>
                                <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {myTransactions.map((transaction) => (
                        <div
                            key={transaction._id}
                            className="border border-borderColor rounded-lg flex flex-col md:flex-row md:justify-between px-4 py-4 md:py-1 items-end md:items-center gap-4"
                        >

                            <div className="flex flex-row gap-4 items-center">
                                <div
                                    className="w-20 h-20 rounded-md bg-borderColor/10 flex-shrink-0 flex-grow-0 flex items-center justify-center overflow-hidden border border-borderColor/30"
                                >
                                    <Image
                                        src={transaction.product?.images?.[0]
                                            ? `/api/proxy?key=${encodeURIComponent(transaction.product.images[0])}`
                                            : "/placeholder.jpg"}
                                        alt={transaction.product?.name || "Product"}
                                        width={80}
                                        height={80}
                                        className="object-cover w-[80px] h-[80px]"
                                    />
                                </div>
                                <div className="flex flex-col w-full max-w-xs gap-1">
                                    <div className="font-semibold text-textColor text-base truncate">
                                        {transaction.product?.name || transaction.productId}
                                    </div>
                                    <div className="text-xs text-lightColor line-clamp-2">
                                        {transaction.product?.description || ""}
                                    </div>

                                </div>
                            </div>



                            <div className='flex w-full justify-between gap-1 md:gap-2 items-center'>
                                <button
                                    onClick={() => prevModel(transaction._id, transaction.assets.length)}
                                    className='toggleXbutton'
                                >
                                    <GoChevronLeft size={20} />
                                </button>
                                <div className='py-1 md:p-2 w-full flex overflow-x-hidden'>
                                    <div
                                        className='flex gap-2'
                                        style={{
                                            transform: `translateX(-${(currentModelIdx[transaction._id] ?? 0) * 92}px)`,
                                            transition: 'transform 0.3s ease-in-out'
                                        }}
                                    >
                                        {transaction.assets.map((modelLink, modelIdx) => (
                                            <div
                                                key={modelIdx}
                                                className='flex h-[84px] aspect-square items-center justify-center flex-col border border-borderColor text-lightColor text-sm gap-1 cursor-pointer hover:bg-borderColor/10 transition'
                                                onClick={() => downloadModel(transaction.productId, modelIdx)}
                                            >
                                                <IoMdDownload size={20} />
                                                {modelLink.split('.').pop()}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <button
                                    onClick={() => nextModel(transaction._id, transaction.assets.length)}
                                    className='toggleXbutton'
                                >
                                    <GoChevronRight size={20} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export default DownloadsSection