'use client'
import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { GoStar, GoStarFill, GoSearch, GoThumbsup } from 'react-icons/go';
import { HiOutlineThumbUp } from 'react-icons/hi';
import { BiTrash, BiPencil } from 'react-icons/bi';
import Image from 'next/image';
import { useToast } from '../General/ToastProvider';
import ReviewForm from './ReviewForm';
import useAccess from '@/utils/useAccess';

function ReviewSection({ product, userOrders = [] }) {
    const { user, isLoaded, isSignedIn } = useUser();
    const { isAdmin } = useAccess();
    const { showToast } = useToast();

    const [reviews, setReviews] = useState(product?.reviews || []);
    const [filteredReviews, setFilteredReviews] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterRating, setFilterRating] = useState('all');
    const [sortBy, setSortBy] = useState('recent'); // recent, helpful, rating-high, rating-low
    const [showReviewForm, setShowReviewForm] = useState(false);
    const [editingReview, setEditingReview] = useState(null);
    const [expandedReviews, setExpandedReviews] = useState(new Set());

    // Check if user can review this product
    const [canReview, setCanReview] = useState(false);
    const [userPurchasedOrder, setUserPurchasedOrder] = useState(null);
    const [hasReviewed, setHasReviewed] = useState(false);

    useEffect(() => {
        if (isLoaded && isSignedIn && user) {
            // Check if user has purchased this product
            const purchasedOrder = userOrders.find(order =>
                order.items?.some(item =>
                    item.productId?.toString() === product._id?.toString() && !item.reviewed
                )
            );

            if (purchasedOrder) {
                setUserPurchasedOrder(purchasedOrder);
                setCanReview(true);
            }

            // Check if user already reviewed
            const existingReview = reviews.find(r => r.userId === user.id);
            setHasReviewed(!!existingReview);
        }
    }, [isLoaded, isSignedIn, user, userOrders, product._id, reviews]);

    useEffect(() => {
        setReviews(product?.reviews || []);
    }, [product?.reviews]);

    // Filter and sort reviews
    useEffect(() => {
        let filtered = [...reviews];

        // Search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(review =>
                review.comment?.toLowerCase().includes(query) ||
                review.username?.toLowerCase().includes(query)
            );
        }

        // Rating filter
        if (filterRating !== 'all') {
            const rating = parseInt(filterRating);
            filtered = filtered.filter(review => review.rating === rating);
        }

        // Sort
        filtered.sort((a, b) => {
            switch (sortBy) {
                case 'recent':
                    return new Date(b.createdAt) - new Date(a.createdAt);
                case 'helpful':
                    return (b.helpful?.length || 0) - (a.helpful?.length || 0);
                case 'rating-high':
                    return b.rating - a.rating;
                case 'rating-low':
                    return a.rating - b.rating;
                default:
                    return 0;
            }
        });

        setFilteredReviews(filtered);
    }, [reviews, searchQuery, filterRating, sortBy]);

    const calculateAverageRating = () => {
        if (reviews.length === 0) return 0;
        const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
        return (sum / reviews.length).toFixed(1);
    };

    const getRatingDistribution = () => {
        const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        reviews.forEach(review => {
            distribution[review.rating]++;
        });
        return distribution;
    };

    const handleHelpful = async (reviewId) => {
        if (!isSignedIn) {
            showToast('Please sign in to mark reviews as helpful', 'error');
            return;
        }

        try {
            const response = await fetch('/api/review/helpful', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId: product._id, reviewId })
            });

            if (response.ok) {
                const { helpfulCount, isHelpful } = await response.json();

                setReviews(prev => prev.map(review => {
                    if (review._id === reviewId) {
                        const helpful = review.helpful || [];
                        return {
                            ...review,
                            helpful: isHelpful
                                ? [...helpful, user.id]
                                : helpful.filter(id => id !== user.id)
                        };
                    }
                    return review;
                }));

                showToast(isHelpful ? 'Marked as helpful' : 'Removed helpful mark', 'success');
            } else {
                const error = await response.json();
                showToast(error.error || 'Failed to update', 'error');
            }
        } catch (error) {
            console.error('Error marking review as helpful:', error);
            showToast('Something went wrong', 'error');
        }
    };

    const handleDeleteReview = async (reviewId) => {
        if (!confirm('Are you sure you want to delete this review?')) return;

        try {
            const response = await fetch(`/api/review?productId=${product._id}&reviewId=${reviewId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                setReviews(prev => prev.filter(review => review._id !== reviewId));
                setHasReviewed(false);
                showToast('Review deleted successfully', 'success');
            } else {
                const error = await response.json();
                showToast(error.error || 'Failed to delete review', 'error');
            }
        } catch (error) {
            console.error('Error deleting review:', error);
            showToast('Something went wrong', 'error');
        }
    };

    const handleReviewSubmitted = (newReview) => {
        setReviews(prev => [...prev, newReview]);
        setShowReviewForm(false);
        setHasReviewed(true);
        setCanReview(false);
        showToast('Review submitted successfully!', 'success');
    };

    const handleReviewUpdated = (updatedReview) => {
        setReviews(prev => prev.map(review =>
            review._id === updatedReview._id ? updatedReview : review
        ));
        setEditingReview(null);
        showToast('Review updated successfully!', 'success');
    };

    const toggleExpandReview = (reviewId) => {
        setExpandedReviews(prev => {
            const newSet = new Set(prev);
            if (newSet.has(reviewId)) {
                newSet.delete(reviewId);
            } else {
                newSet.add(reviewId);
            }
            return newSet;
        });
    };

    const distribution = getRatingDistribution();
    const avgRating = calculateAverageRating();

    return (
        <div className="flex flex-col w-full gap-6 mt-8">
            {/* Header */}
            <div className="flex flex-col gap-2">
                <h2>Customer Reviews</h2>
                <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map(star => (
                                <GoStarFill key={star} className={`text-lg ${star <= Math.round(avgRating) ? 'text-textColor' : 'text-borderColor'}`} />
                            ))}
                        </div>
                        <span className="font-medium text-lg">{avgRating}</span>
                        <span className="text-lightColor text-sm">({reviews.length} {reviews.length === 1 ? 'review' : 'reviews'})</span>
                    </div>
                </div>
            </div>

            {/* Rating Distribution */}
            {reviews.length > 0 && (
                <div className="flex flex-col gap-2 pb-6 border-b border-borderColor">
                    {[5, 4, 3, 2, 1].map(rating => {
                        const count = distribution[rating];
                        const percentage = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                        return (
                            <button
                                key={rating}
                                onClick={() => setFilterRating(filterRating === rating.toString() ? 'all' : rating.toString())}
                                className={`flex items-center gap-3 hover:opacity-70 transition-opacity ${filterRating === rating.toString() ? 'opacity-100' : 'opacity-60'}`}
                            >
                                <span className="text-sm w-12">{rating} star</span>
                                <div className="flex-1 h-2 bg-borderColor rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-textColor transition-all duration-300"
                                        style={{ width: `${percentage}%` }}
                                    />
                                </div>
                                <span className="text-sm text-lightColor w-8 text-right">{count}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Write Review Button */}
            {isLoaded && isSignedIn && canReview && !hasReviewed && (
                <button
                    onClick={() => setShowReviewForm(true)}
                    className="formBlackButton w-full sm:w-auto"
                >
                    Write a Review
                </button>
            )}

            {/* Review Form */}
            {(showReviewForm || editingReview) && (
                <ReviewForm
                    product={product}
                    order={userPurchasedOrder}
                    existingReview={editingReview}
                    onSubmit={editingReview ? handleReviewUpdated : handleReviewSubmitted}
                    onCancel={() => {
                        setShowReviewForm(false);
                        setEditingReview(null);
                    }}
                />
            )}

            {/* Filters and Search */}
            {reviews.length > 0 && (
                <div className="flex flex-col sm:flex-row gap-3 pb-4 border-b border-borderColor">
                    {/* Search */}
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

                    {/* Sort */}
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="px-4 py-2 border border-borderColor rounded-sm focus:outline-none focus:border-textColor bg-background"
                    >
                        <option value="recent">Most Recent</option>
                        <option value="helpful">Most Helpful</option>
                        <option value="rating-high">Highest Rating</option>
                        <option value="rating-low">Lowest Rating</option>
                    </select>

                    {/* Clear Filters */}
                    {(searchQuery || filterRating !== 'all') && (
                        <button
                            onClick={() => {
                                setSearchQuery('');
                                setFilterRating('all');
                            }}
                            className="px-4 py-2 text-sm text-lightColor hover:text-textColor transition-colors"
                        >
                            Clear Filters
                        </button>
                    )}
                </div>
            )}

            {/* Reviews List */}
            {filteredReviews.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <GoStar className="text-4xl text-borderColor mb-3" />
                    <p className="text-lightColor">
                        {reviews.length === 0
                            ? 'No reviews yet. Be the first to review this product!'
                            : 'No reviews match your filters.'}
                    </p>
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    {filteredReviews.map(review => {
                        const isExpanded = expandedReviews.has(review._id);
                        const isLongComment = review.comment && review.comment.length > 300;
                        const displayComment = isExpanded || !isLongComment
                            ? review.comment
                            : review.comment.substring(0, 300) + '...';
                        const isOwnReview = isSignedIn && user?.id === review.userId;
                        const isHelpful = isSignedIn && review.helpful?.includes(user?.id);

                        return (
                            <div key={review._id} className="flex flex-col gap-3 pb-6 border-b border-borderColor">
                                {/* Reviewer Info */}
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
                                                        Verified Purchase
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-xs text-lightColor">
                                                {new Date(review.createdAt).toLocaleDateString('en-US', {
                                                    year: 'numeric',
                                                    month: 'long',
                                                    day: 'numeric'
                                                })}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    {(isOwnReview || isAdmin) && (
                                        <div className="flex items-center gap-2">
                                            {isOwnReview && (
                                                <button
                                                    onClick={() => setEditingReview(review)}
                                                    className="p-2 hover:bg-borderColor/50 rounded-sm transition-colors"
                                                    title="Edit review"
                                                >
                                                    <BiPencil className="text-lg" />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDeleteReview(review._id)}
                                                className="p-2 hover:bg-red-50 text-red-600 rounded-sm transition-colors"
                                                title="Delete review"
                                            >
                                                <BiTrash className="text-lg" />
                                            </button>
                                        </div>
                                    )}
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

                                {/* Purchased Variant Info */}
                                {review.purchasedVariants && Object.keys(review.purchasedVariants).length > 0 && (
                                    <div className="text-sm text-lightColor">
                                        Purchased: {Object.entries(review.purchasedVariants)
                                            .map(([type, option]) => `${type}: ${option}`)
                                            .join(', ')}
                                    </div>
                                )}

                                {/* Comment */}
                                {review.comment && (
                                    <div className="flex flex-col gap-2">
                                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{displayComment}</p>
                                        {isLongComment && (
                                            <button
                                                onClick={() => toggleExpandReview(review._id)}
                                                className="text-sm text-textColor hover:underline self-start"
                                            >
                                                {isExpanded ? 'Show less' : 'Read more'}
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* Media */}
                                {review.mediaUrls && review.mediaUrls.length > 0 && (
                                    <div className="flex gap-2 flex-wrap">
                                        {review.mediaUrls.map((url, idx) => (
                                            <div key={idx} className="relative w-24 h-24 rounded-sm overflow-hidden border border-borderColor">
                                                <Image
                                                    src={url}
                                                    alt={`Review media ${idx + 1}`}
                                                    fill
                                                    className="object-cover cursor-pointer hover:opacity-80 transition-opacity"
                                                    onClick={() => window.open(url, '_blank')}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Helpful Button */}
                                <div className="flex items-center gap-2 mt-2">
                                    <button
                                        onClick={() => handleHelpful(review._id)}
                                        disabled={!isSignedIn}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-sm text-sm transition-colors ${isHelpful
                                                ? 'bg-textColor text-background'
                                                : 'border border-borderColor hover:border-textColor'
                                            } ${!isSignedIn && 'opacity-50 cursor-not-allowed'}`}
                                    >
                                        {isHelpful ? <GoThumbsup /> : <HiOutlineThumbUp />}
                                        <span>Helpful {review.helpful?.length > 0 && `(${review.helpful.length})`}</span>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default ReviewSection;
