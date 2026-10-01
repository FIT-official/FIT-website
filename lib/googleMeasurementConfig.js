// Public identifiers verified in FIT Merchant Center. These are not credentials.
export const GOOGLE_TAG_ID = 'GT-WVC7JD8N';
export const GOOGLE_MERCHANT_DESTINATION = 'MC-DXFF1614W0';
export const GOOGLE_MERCHANT_ID = 5861883835;
export const GOOGLE_REVIEW_POLICY = Object.freeze({
    enabled: true,
    agreementApproved: true,
    privacyNoticeApproved: true,
    transactionSharingApproved: true,
    merchantId: GOOGLE_MERCHANT_ID,
});

// Local and Vercel previews must never generate production measurement.
export function isGoogleMeasurementHost(hostname) {
    return ['www.fixitoday.com', 'fixitoday.com'].includes(hostname);
}
