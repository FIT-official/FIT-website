import { SITE_URL } from './site';

// A store placeholder is not a product photo, even when its URL resolves.
// Missing real photos require a catalogue data repair, not a substitute image.
export function usableMerchantImages(images) {
    return (images || []).filter(image => {
        try {
            const url = new URL(image, SITE_URL);
            const imagePath = decodeURIComponent(url.searchParams.get('key') || url.pathname);
            if (/\/(?:photo-pending\.svg|placeholder\.jpg)$/.test(imagePath)) return false;
            return ['https:', 'http:'].includes(url.protocol);
        } catch {
            return false;
        }
    });
}
