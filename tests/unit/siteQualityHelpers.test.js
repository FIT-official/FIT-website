// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { usableMerchantImages } from '@/lib/seo/merchantImages';
import { manifest, planVariants } from '../../scripts/prepare-pla-basic-variants.mjs';
import { collectBlogLinks } from '../../scripts/check-blog-links.mjs';

it('excludes placeholders from primary and additional merchant photos', () => {
    expect(usableMerchantImages([
        '/product-images/photo-pending.svg', '/placeholder.jpg',
        '/api/proxy?key=%2Fproduct-images%2Fphoto-pending.svg',
        'https://images.example.com/photo.jpg', 'javascript:alert(1)',
    ])).toEqual(['https://images.example.com/photo.jpg']);
});

describe('variant data plan', () => {
    const product = { slug: manifest.slug, variantTypes: [
        { _id: 'colour-id', name: 'Spool', options: [{ _id: 'red-id', name: 'Red', stock: 8 }] },
        { _id: 'spool-id', name: 'Colour', options: [
            { _id: 'with-id', name: 'With Spool', additionalFee: 4, stock: 12 },
            { _id: 'without-id', name: 'Without Spool', additionalFee: 0, stock: 9 },
        ] },
    ] };
    it('corrects labels/default while preserving option fields and becomes a no-op on rerun', () => {
        const before = structuredClone(product);
        const plan = planVariants(product);
        expect(product).toEqual(before);
        expect(plan.changed).toBe(true);
        expect(plan.variantTypes.map(type => type.name)).toEqual(['Colour', 'Spool']);
        expect(plan.variantTypes[1].options).toEqual([...product.variantTypes[1].options].reverse());
        expect(planVariants({ ...product, variantTypes: plan.variantTypes }).changed).toBe(false);
    });
    it('refuses missing, ambiguous or unexpected options and other products', () => {
        expect(() => planVariants({ ...product, slug: 'different-product' })).toThrow();
        expect(() => planVariants({ ...product, variantTypes: [] })).toThrow();
        const ambiguous = structuredClone(product);
        ambiguous.variantTypes[1].options.push({ name: 'No Spool' });
        expect(() => planVariants(ambiguous)).toThrow('Ambiguous');
    });
});

it('finds stored markdown, reference, HTML and TipTap blog links without external URLs', () => {
    const base = 'https://www.example.com';
    expect(collectBlogLinks({ content: '[Guide](/blog/alpha)\n\n[Guide][ref]\n\n[ref]: /blog/beta\n\n<a href="/blog/gamma">Guide</a>\n\n[External](https://other.example/blog/no)', cta: { url: '/blog/delta' } }, base).sort())
        .toEqual(['alpha', 'beta', 'delta', 'gamma']);
    expect(collectBlogLinks({ contentFormat: 'tiptap', content: '[Old](/blog/stale)', contentJson: {
        type: 'doc', content: [
            { type: 'text', marks: [{ type: 'link', attrs: { href: '/blog/alpha' } }] },
            { type: 'htmlBlock', attrs: { html: '<a href="/blog/beta">Guide</a>' } },
        ],
    } }, base)).toEqual(['alpha', 'beta']);
});
