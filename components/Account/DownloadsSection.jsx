'use client'
// Digital purchases as quiet document rows: thumbnail + name (linked to the
// product page when a slug exists) and every purchased file as a download
// chip in a horizontally scrolling strip (replaces the old chevron carousel;
// every asset stays reachable). Fetch/download endpoints unchanged.
import { useEffect, useState } from 'react'
import ProductImage from '@/components/ProductImage'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IoMdDownload } from 'react-icons/io'
import { EmptyState, SkeletonRow } from '@/components/dashboard-ui'
import { useToast } from '@/components/General/ToastProvider'

function DownloadsSection({ user, isLoaded }) {
    const [myTransactions, setMyTransactions] = useState([])
    const [loading, setLoading] = useState(true)
    const { showToast } = useToast()
    const router = useRouter()

    const downloadModel = async (productId, linkIdx) => {
        if (!isLoaded || !user) {
            router.push('/sign-in?redirect=/products')
            return
        }
        try {
            const res = await fetch(`/api/asset/download/${productId}?idx=${linkIdx}`)
            const data = await res.json()
            if (data.downloadUrl) {
                window.open(data.downloadUrl, '_blank')
            } else {
                showToast('Download link not available.', 'error')
            }
        } catch (err) {
            showToast('Download failed.', 'error')
        }
    }

    useEffect(() => {
        const fetchTransactions = async () => {
            try {
                const transactionsRes = await fetch('/api/asset/storage', {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                })
                const transactionData = await transactionsRes.json()

                const productIds = [...new Set(transactionData.transactions.map((t) => t.productId))]
                const productsRes = await fetch(`/api/product?ids=${productIds.join(',')}`)
                const productsData = await productsRes.json()

                setMyTransactions(
                    transactionData.transactions.map((transaction) => {
                        const product = productsData.products.find(
                            (p) => p._id === transaction.productId || p.id === transaction.productId,
                        )
                        return {
                            ...transaction,
                            product,
                        }
                    }),
                )
            } catch (error) {
                showToast('Failed to fetch transactions: ' + error.message, 'error')
            } finally {
                setLoading(false)
            }
        }

        if (user && isLoaded) {
            fetchTransactions()
        }
    }, [user, isLoaded])

    return (
        <div className="flex flex-col gap-6">
            <div>
                <h2 className="dash-title">Your digital purchases</h2>
                <p className="text-[13px] dash-soft mt-1">Download the files you have purchased, any time.</p>
            </div>

            {loading ? (
                <div className="flex flex-col gap-2">
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                </div>
            ) : myTransactions.length === 0 ? (
                <div className="bg-[var(--dash-card)] border border-[var(--dash-line)] rounded-[var(--dash-r-card)]">
                    <EmptyState
                        title="No Digital Purchases Yet"
                        body="Files from digital products you buy will be waiting for you here."
                        secondary="Browse the shop"
                        onSecondary={() => router.push('/shop')}
                    />
                </div>
            ) : (
                <div className="border-t border-[var(--dash-line)] divide-y divide-[var(--dash-line)]">
                    {myTransactions.map((transaction) => (
                        <div key={transaction._id} className="py-5">
                            <div className="flex flex-col md:flex-row md:items-center gap-4">
                                <div className="flex flex-row gap-4 items-center min-w-0 md:w-1/2">
                                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[var(--dash-r-inner)] border border-[var(--dash-line)] bg-[var(--dash-canvas)]">
                                        <ProductImage
                                            src={transaction.product?.images?.[0]}
                                            alt={transaction.product?.name || 'Product'}
                                            width={64}
                                            height={64}
                                            className="object-cover h-full w-full"
                                        />
                                    </div>
                                    <div className="flex flex-col min-w-0 gap-0.5">
                                        {transaction.product?.slug ? (
                                            <Link
                                                href={`/products/${transaction.product.slug}`}
                                                className="text-[13px] font-medium truncate hover:underline"
                                            >
                                                {transaction.product?.name || transaction.productId}
                                            </Link>
                                        ) : (
                                            <p className="text-[13px] font-medium truncate">
                                                {transaction.product?.name || transaction.productId}
                                            </p>
                                        )}
                                        {transaction.product?.description && (
                                            <p className="dash-data dash-soft line-clamp-2">
                                                {transaction.product.description}
                                            </p>
                                        )}
                                        <p className="dash-label mt-0.5">
                                            {transaction.assets.length} file
                                            {transaction.assets.length === 1 ? '' : 's'}
                                        </p>
                                    </div>
                                </div>

                                <div className="dash-hscroll flex gap-2 md:flex-1 min-w-0">
                                    {transaction.assets.map((modelLink, modelIdx) => (
                                        <button
                                            key={modelIdx}
                                            type="button"
                                            onClick={() => downloadModel(transaction.productId, modelIdx)}
                                            className="dash-hoverable flex h-[72px] w-[72px] shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-[var(--dash-r-inner)] border border-[var(--dash-line)] bg-[var(--dash-card)] text-[12px] font-medium dash-soft hover:text-[var(--dash-ink)] hover:bg-[var(--dash-canvas)]"
                                        >
                                            <IoMdDownload size={18} aria-hidden="true" />
                                            {modelLink.split('.').pop()}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export default DownloadsSection
