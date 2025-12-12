'use client'
import { useState, useRef } from 'react';
import { GoStar, GoStarFill, GoX } from 'react-icons/go';
import { HiOutlineCamera } from 'react-icons/hi';
import Image from 'next/image';
import { useToast } from '../General/ToastProvider';

function ReviewForm({ product, order, existingReview = null, onSubmit, onCancel }) {
    const { showToast } = useToast();
    const [rating, setRating] = useState(existingReview?.rating || 0);
    const [hoverRating, setHoverRating] = useState(0);
    const [comment, setComment] = useState(existingReview?.comment || '');
    const [mediaFiles, setMediaFiles] = useState([]);
    const [existingMedia, setExistingMedia] = useState(existingReview?.mediaUrls || []);
    const [removedMedia, setRemovedMedia] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const mediaInputRef = useRef(null);

    const handleMediaChange = (e) => {
        const files = Array.from(e.target.files);
        const validFiles = files.filter(file => {
            const isImage = file.type.startsWith('image/');
            const isVideo = file.type.startsWith('video/');
            const isValidSize = file.size <= 10 * 1024 * 1024; // 10MB

            if (!isImage && !isVideo) {
                showToast('Only images and videos are allowed', 'error');
                return false;
            }

            if (!isValidSize) {
                showToast('File size must be less than 10MB', 'error');
                return false;
            }

            return true;
        });

        const totalMedia = existingMedia.length - removedMedia.length + mediaFiles.length + validFiles.length;
        if (totalMedia > 3) {
            showToast('Maximum 3 media files allowed', 'error');
            return;
        }

        setMediaFiles(prev => [...prev, ...validFiles]);
    };

    const handleRemoveNewMedia = (index) => {
        setMediaFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleRemoveExistingMedia = (url) => {
        setRemovedMedia(prev => [...prev, url]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (rating === 0) {
            showToast('Please select a rating', 'error');
            return;
        }

        if (!comment.trim() && mediaFiles.length === 0 && existingMedia.length === 0) {
            showToast('Please add a comment or media', 'error');
            return;
        }

        setIsSubmitting(true);

        try {
            // Convert media files to base64 for upload
            const mediaBase64 = await Promise.all(
                mediaFiles.map(file => {
                    return new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });
                })
            );

            const payload = {
                productId: product._id,
                rating,
                comment: comment.trim(),
                mediaFiles: mediaBase64,
                orderId: order?.orderId || null
            };

            if (existingReview) {
                payload.reviewId = existingReview._id;
                payload.removedMediaUrls = removedMedia;
            }

            const url = existingReview ? '/api/review' : '/api/review';
            const method = existingReview ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const data = await response.json();
                onSubmit(data.review);

                // Reset form
                setRating(0);
                setComment('');
                setMediaFiles([]);
                setExistingMedia([]);
                setRemovedMedia([]);
            } else {
                const error = await response.json();
                showToast(error.error || 'Failed to submit review', 'error');
            }
        } catch (error) {
            console.error('Error submitting review:', error);
            showToast('Something went wrong', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const displayRating = hoverRating || rating;
    const currentMediaCount = existingMedia.filter(url => !removedMedia.includes(url)).length + mediaFiles.length;

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 border border-borderColor rounded-sm bg-baseColor">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">
                    {existingReview ? 'Edit Your Review' : 'Write a Review'}
                </h3>
                <button
                    type="button"
                    onClick={onCancel}
                    className="p-2 hover:bg-borderColor rounded-sm transition-colors"
                >
                    <GoX className="text-xl" />
                </button>
            </div>

            {/* Product Info */}
            <div className="flex items-center gap-3 pb-4 border-b border-borderColor">
                {product.images && product.images[0] && (
                    <div className="relative w-16 h-16 rounded-sm overflow-hidden border border-borderColor">
                        <Image
                            src={product.images[0]}
                            alt={product.name}
                            fill
                            className="object-cover"
                        />
                    </div>
                )}
                <div className="flex flex-col">
                    <span className="font-medium">{product.name}</span>
                    {order && (
                        <span className="text-sm text-lightColor">
                            Purchased on {new Date(order.createdAt).toLocaleDateString()}
                        </span>
                    )}
                </div>
            </div>

            {/* Rating */}
            <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Your Rating *</label>
                <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map(star => (
                        <button
                            key={star}
                            type="button"
                            onClick={() => setRating(star)}
                            onMouseEnter={() => setHoverRating(star)}
                            onMouseLeave={() => setHoverRating(0)}
                            className="text-3xl transition-transform hover:scale-110"
                        >
                            {star <= displayRating ? (
                                <GoStarFill className="text-textColor" />
                            ) : (
                                <GoStar className="text-borderColor" />
                            )}
                        </button>
                    ))}
                    {rating > 0 && (
                        <span className="text-sm text-lightColor ml-2">
                            {rating === 1 && 'Poor'}
                            {rating === 2 && 'Fair'}
                            {rating === 3 && 'Good'}
                            {rating === 4 && 'Very Good'}
                            {rating === 5 && 'Excellent'}
                        </span>
                    )}
                </div>
            </div>

            {/* Comment */}
            <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Your Review</label>
                <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Share your experience with this product..."
                    rows={5}
                    maxLength={2000}
                    className="w-full p-3 border border-borderColor rounded-sm focus:outline-none focus:border-textColor resize-none"
                />
                <span className="text-xs text-lightColor self-end">
                    {comment.length} / 2000 characters
                </span>
            </div>

            {/* Media Upload */}
            <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Photos or Videos (Optional)</label>
                <div className="flex flex-wrap gap-3">
                    {/* Existing Media */}
                    {existingMedia.filter(url => !removedMedia.includes(url)).map((url, idx) => (
                        <div key={`existing-${idx}`} className="relative w-24 h-24 rounded-sm overflow-hidden border-2 border-borderColor group">
                            <Image
                                src={url}
                                alt={`Review media ${idx + 1}`}
                                fill
                                className="object-cover"
                            />
                            <button
                                type="button"
                                onClick={() => handleRemoveExistingMedia(url)}
                                className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <GoX className="text-sm" />
                            </button>
                        </div>
                    ))}

                    {/* New Media Preview */}
                    {mediaFiles.map((file, idx) => (
                        <div key={`new-${idx}`} className="relative w-24 h-24 rounded-sm overflow-hidden border-2 border-dashed border-borderColor group">
                            <Image
                                src={URL.createObjectURL(file)}
                                alt={`New media ${idx + 1}`}
                                fill
                                className="object-cover"
                            />
                            <button
                                type="button"
                                onClick={() => handleRemoveNewMedia(idx)}
                                className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <GoX className="text-sm" />
                            </button>
                        </div>
                    ))}

                    {/* Upload Button */}
                    {currentMediaCount < 3 && (
                        <button
                            type="button"
                            onClick={() => mediaInputRef.current?.click()}
                            className="w-24 h-24 border-2 border-dashed border-borderColor rounded-sm flex flex-col items-center justify-center gap-1 hover:border-textColor transition-colors"
                        >
                            <HiOutlineCamera className="text-2xl text-lightColor" />
                            <span className="text-xs text-lightColor">Add Media</span>
                        </button>
                    )}

                    <input
                        ref={mediaInputRef}
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        onChange={handleMediaChange}
                        className="hidden"
                    />
                </div>
                <span className="text-xs text-lightColor">
                    You can upload up to 3 photos or videos (max 10MB each)
                </span>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-4 border-t border-borderColor">
                <button
                    type="button"
                    onClick={onCancel}
                    className="formButton2 flex-1"
                    disabled={isSubmitting}
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    className="formBlackButton flex-1"
                    disabled={isSubmitting || rating === 0}
                >
                    {isSubmitting ? (
                        <>
                            Submitting
                            <div className='animate-spin ml-3 border border-t-transparent h-3 w-3 rounded-full' />
                        </>
                    ) : (
                        existingReview ? 'Update Review' : 'Submit Review'
                    )}
                </button>
            </div>
        </form>
    );
}

export default ReviewForm;
