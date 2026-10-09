import catalogue from '@/tests/fixtures/bambuShop.json';
// Public catalogue fixture already held by this repo, with local representative
// filament artwork. This is not a fresh stock or product-photo verification.
export const previewCatalogue = catalogue.map((product, index) => ({
    ...product, _id: `fixture-product-${index}`, productType: 'shop', listing: 'fit', hidden: false,
    images: ['/filament.png'], likeCount: 0, salesCount: 0,
}));
