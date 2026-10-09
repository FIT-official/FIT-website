// Dry run: node --env-file=.env.local scripts/prepare-pla-basic-variants.mjs
// Apply after catalogue review: append --apply. No prices, IDs or stock in the manifest.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';

export const manifest = JSON.parse(readFileSync(new URL('./pla-basic-variants.json', import.meta.url), 'utf8'));

export function planVariants(product, plan = manifest) {
    if (product?.slug !== plan.slug) throw new Error('Product does not match the manifest');
    const types = structuredClone(product.variantTypes || []);
    const spoolTypes = types.filter(type => type.options?.some(option => plan.noSpoolNames.includes(option.name)));
    if (spoolTypes.length !== 1) throw new Error('A unique No Spool / Without Spool option is required');
    const spool = spoolTypes[0];
    const defaults = spool.options.filter(option => plan.noSpoolNames.includes(option.name));
    if (defaults.length !== 1) throw new Error('Ambiguous spool default; review the options');
    // Only handle the observed two-group label swap, or already-correct labels.
    if (spool.name !== plan.spoolTypeName) {
        const colour = types.find(type => type !== spool && type.name === plan.spoolTypeName);
        if (types.length !== 2 || spool.name !== plan.colourTypeName || !colour ||
            colour.options.some(option => /^(?:with|without|no) spool$/i.test(option.name))) {
            throw new Error('Variant labels need manual review');
        }
        colour.name = plan.colourTypeName;
        spool.name = plan.spoolTypeName;
    }
    spool.options = [defaults[0], ...spool.options.filter(option => option !== defaults[0])];
    return { changed: JSON.stringify(types) !== JSON.stringify(product.variantTypes), variantTypes: types };
}

export async function main(args = process.argv.slice(2)) {
    if (args.some(arg => arg !== '--apply')) throw new Error('Only --apply is supported');
    if (!process.env.MONGODB_URI) throw new Error('Missing setting: MONGODB_URI');
    const connection = await mongoose.createConnection(process.env.MONGODB_URI, {
        autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 8000,
    }).asPromise();
    try {
        const products = connection.collection('products');
        const product = await products.findOne({ slug: manifest.slug }, { projection: { slug: 1, variantTypes: 1 } });
        // BSON IDs must survive unchanged; use JSON only for the pure planning copy.
        const plan = planVariants(product ? JSON.parse(JSON.stringify(product)) : null);
        console.log(JSON.stringify({ mode: args.includes('--apply') ? 'apply' : 'dry-run', changed: plan.changed,
            groups: plan.variantTypes.map(type => ({ name: type.name, defaultOption: type.options[0]?.name })) }));
        if (!args.includes('--apply') || !plan.changed) return;
        const nextTypes = plan.variantTypes.map(type => {
            const original = product.variantTypes.find(entry => String(entry._id) === type._id);
            return { ...original, name: type.name, options: type.options.map(option =>
                original.options.find(entry => String(entry._id) === option._id)) };
        });
        // Compare-and-set: never overwrite a concurrent stock/catalogue update.
        const result = await products.updateOne({ _id: product._id, variantTypes: product.variantTypes },
            { $set: { variantTypes: nextTypes } });
        if (result.matchedCount !== 1) throw new Error('Catalogue changed during review; rerun the dry run');
        console.log('Variant default and labels updated');
    } finally {
        await connection.close();
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => {
        console.error(error.message.startsWith('Missing setting:') ? error.message : 'Variant update stopped; check connectivity or catalogue shape. No credentials are logged.');
        process.exitCode = 1;
    });
}
