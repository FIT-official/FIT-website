'use client'
import { useState, useEffect } from 'react';
import { GoStar, GoStarFill, GoSearch, GoTrash } from 'react-icons/go';
import { BiTrash } from 'react-icons/bi';
import Image from 'next/image';
import { useToast } from '../General/ToastProvider';

function ReviewManagement() {
    const { showToast } = useToast();
    const [products, setProducts] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [reviews, setReviews] = useState([]);
    const [filteredReviews, setFilteredReviews] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterRating, setFilterRating] = useState('all');
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState(null);

    useEffect(() => {
        fetchProducts();
    }, []);

    const fetchProducts = async () => {
        try {
            const response = await fetch('/api/product?all=true');
            if (response.ok) {
                const data = await response.json();
                const productsWithReviews = data.products.filter(p => p.reviews && p.reviews.length > 0);
                setProducts(productsWithReviews);
            }
        } catch (error) {
            console.error('Error fetching products:', error);
            showToast('Failed to load products', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedProduct) {
            setReviews(selectedProduct.reviews || []);
        }
    }, [selectedProduct]);

    useEffect(() => {
        let filtered = [...reviews];

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(review =>
                review.comment?.toLowerCase().includes(query) ||
                review.username?.toLowerCase().includes(query) ||
                review.userId?.toLowerCase().includes(query)
            );
        }

        if (filterRating !== 'all') {
            const rating = parseInt(filterRating);
            filtered = filtered.filter(review => review.rating === rating);
        }

        // Sort by most recent
        filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        setFilteredReviews(filtered);
    }, [reviews, searchQuery, filterRating]);

    const handleDeleteReview = async (productId, reviewId) => {
        if (!confirm('Are you sure you want to delete this review? This action cannot be undone.')) return;

        setDeleting(reviewId);
        try {
            const response = await fetch(`/api/review?productId=${productId}&reviewId=${reviewId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                // Update local state
                setReviews(prev => prev.filter(review => review._id !== reviewId));

                // Update products list
                setProducts(prev => prev.map(product => {
                    if (product._id === productId) {
                        return {
                            ...product,
                            reviews: product.reviews.filter(r => r._id !== reviewId)
                        };
                    }
                    return product;
                }));

                // Update selected product
                if (selectedProduct?._id === productId) {
                    setSelectedProduct(prev => ({
                        ...prev,
                        reviews: prev.reviews.filter(r => r._id !== reviewId)
                    }));
                }

                showToast('Review deleted successfully', 'success');
            } else {
                const error = await response.json();
                showToast(error.error || 'Failed to delete review', 'error');
            }
        } catch (error) {
            console.error('Error deleting review:', error);
            showToast('Something went wrong', 'error');
        } finally {
            setDeleting(null);
        }
    };

    const calculateAverageRating = (productReviews) => {
        if (productReviews.length === 0) return 0;
        const sum = productReviews.reduce((acc, review) => acc + review.rating, 0);
        return (sum / productReviews.length).toFixed(1);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin border-2 border-t-transparent h-8 w-8 rounded-full" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 sm:gap-6 p-6 md:p-12  min-h-screen">
            <div className="flex items-center justify-between">
                <h2>Review Management</h2>
                <span className="text-sm text-lightColor">
                    {products.length} products with reviews
                </span>
            </div>

            {products.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 border border-borderColor rounded-sm">
                    <GoStar className="text-4xl text-borderColor mb-3" />
                    <p className="text-lightColor">No products with reviews yet</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Products List */}
                    <div className="flex flex-col gap-3">
                        <h3 className="font-medium">Products</h3>
                        <div className="flex flex-col gap-2 max-h-[600px] overflow-y-auto">
                            {products.map(product => {
                                const avgRating = calculateAverageRating(product.reviews);
                                const isSelected = selectedProduct?._id === product._id;

                                return (
                                    <button
                                        key={product._id}
                                        onClick={() => setSelectedProduct(product)}
                                        className={`flex items-center gap-3 p-3 rounded-sm border transition-all text-left ${isSelected
                                                ? 'border-textColor bg-baseColor'
                                                : 'border-borderColor hover:border-textColor'
                                            }`}
                                    >
                                        {product.images && product.images[0] && (
                                            <div className="relative w-12 h-12 rounded-sm overflow-hidden border border-borderColor shrink-0">
                                                <Image
                                                    src={product.images[0]}
                                                    alt={product.name}
                                                    fill
                                                    className="object-cover"
                                                />
                                            </div>
                                        )}
                                        <div className="flex flex-col flex-1 min-w-0">
                                            <span className="font-medium truncate">{product.name}</span>
                                            <div className="flex items-center gap-2 text-sm">
                                                <div className="flex items-center gap-1">
                                                    <GoStarFill className="text-xs" />
                                                    <span>{avgRating}</span>
                                                </div>
                                                <span className="text-lightColor">
                                                    ({product.reviews.length})
                                                </span>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Reviews List */}
                    <div className="lg:col-span-2 flex flex-col gap-4">
                        {selectedProduct ? (
                            <>
                                {/* Header */}
                                <div className="flex flex-col gap-3 pb-4 border-b border-borderColor">
                                    <h3 className="font-medium">Reviews for {selectedProduct.name}</h3>

                                    {/* Filters */}
                                    <div className="flex flex-col sm:flex-row gap-3">
                                        <div className="flex-1 relative">
                                            <GoSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-lightColor" />
                                            <input
                                                type="text"
                                                placeholder="Search reviews..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="w-full pl-10 pr-4 py-2 border border-borderColor rounded-sm focus:outline-none focus:border-textColor"
                                            />
                                        </div>

                                        <select
                                            value={filterRating}
                                            onChange={(e) => setFilterRating(e.target.value)}
                                            className="px-4 py-2 border border-borderColor rounded-sm focus:outline-none focus:border-textColor bg-background"
                                        >
                                            <option value="all">All Ratings</option>
                                            <option value="5">5 Stars</option>
                                            <option value="4">4 Stars</option>
                                            <option value="3">3 Stars</option>
                                            <option value="2">2 Stars</option>
                                            <option value="1">1 Star</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Reviews */}
                                {filteredReviews.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-center border border-borderColor rounded-sm">
                                        <GoStar className="text-4xl text-borderColor mb-3" />
                                        <p className="text-lightColor">No reviews match your filters</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-4 max-h-[600px] overflow-y-auto">
                                        {filteredReviews.map(review => (
                                            <div
                                                key={review._id}
                                                className="flex flex-col gap-3 p-4 border border-borderColor rounded-sm hover:border-textColor transition-colors"
                                            >
                                                {/* Header */}
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex items-center gap-3">
                                                        {review.userImageUrl ? (
                                                            <Image
                                                                src={review.userImageUrl}
                                                                alt={review.username}
                                                                width={40}
                                                                height={40}
                                                                className="rounded-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-10 h-10 rounded-full bg-borderColor flex items-center justify-center">
                                                                <span className="text-sm font-medium text-lightColor">
                                                                    {review.username?.[0]?.toUpperCase() || 'U'}
                                                                </span>
                                                            </div>
                                                        )}
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-medium">{review.username}</span>
                                                                {review.verifiedPurchase && (
                                                                    <span className="text-xs px-2 py-0.5 bg-textColor text-background rounded-sm">
                                                                        Verified
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className="text-xs text-lightColor">
                                                                {new Date(review.createdAt).toLocaleDateString()}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <button
                                                        onClick={() => handleDeleteReview(selectedProduct._id, review._id)}
                                                        disabled={deleting === review._id}
                                                        className="p-2 hover:bg-red-50 text-red-600 rounded-sm transition-colors disabled:opacity-50"
                                                        title="Delete review"
                                                    >
                                                        {deleting === review._id ? (
                                                            <div className="animate-spin border-2 border-t-transparent h-5 w-5 rounded-full border-red-600" />
                                                        ) : (
                                                            <BiTrash className="text-lg" />
                                                        )}
                                                    </button>
                                                </div>

                                                {/* Rating */}
                                                <div className="flex items-center gap-1">
                                                    {[1, 2, 3, 4, 5].map(star => (
                                                        <GoStarFill
                                                            key={star}
                                                            className={`text-base ${star <= review.rating ? 'text-textColor' : 'text-borderColor'}`}
                                                        />
                                                    ))}
                                                </div>

                                                {/* Comment */}
                                                {review.comment && (
                                                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                                                        {review.comment}
                                                    </p>
                                                )}

                                                {/* Media */}
                                                {review.mediaUrls && review.mediaUrls.length > 0 && (
                                                    <div className="flex gap-2 flex-wrap">
                                                        {review.mediaUrls.map((url, idx) => (
                                                            <div key={idx} className="relative w-20 h-20 rounded-sm overflow-hidden border border-borderColor">
                                                                <Image
                                                                    src={url}
                                                                    alt={`Review media ${idx + 1}`}
                                                                    fill
                                                                    className="object-cover"
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Stats */}
                                                <div className="flex items-center gap-4 text-sm text-lightColor pt-2 border-t border-borderColor">
                                                    <span>{review.helpful?.length || 0} found helpful</span>
                                                    {review.purchasedVariants && Object.keys(review.purchasedVariants).length > 0 && (
                                                        <span>
                                                            Variant: {Object.entries(review.purchasedVariants)
                                                                .map(([type, option]) => `${option}`)
                                                                .join(', ')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 border border-borderColor rounded-sm">
                                <GoStar className="text-4xl text-borderColor mb-3" />
                                <p className="text-lightColor">Select a product to view reviews</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default ReviewManagement;
