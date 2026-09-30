import Creator from "./Creator";
import { notFound } from 'next/navigation';
import { jsonLdString } from '@/lib/jsonLd';
import { creatorMetadata } from '@/lib/seo/creators';
import { renderPublicMarkdown } from '@/lib/seo/publicContent';
import { NON_PUBLIC_PRODUCT_SLUGS, isPublicCatalogueProduct, publicProductDescription } from '@/lib/productPublicContent';
import { productForViewer } from "@/lib/productAccess";
import { connectToDatabase } from "@/lib/db";
import Product from "@/models/Product";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { checkAdminPrivileges } from "@/lib/checkPrivileges";
import { resolveCreatorByIdOrName } from "@/lib/creatorPage/resolveCreator";
import { validateBlocks, normalizeTheme } from "@/lib/creatorPage/blocks";

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
	const { id } = await params;
	return creatorMetadata(await resolveCreatorByIdOrName(id));
}

function serializeForClient(value) {
	if (value == null) return value;

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (Array.isArray(value)) {
		return value.map(serializeForClient);
	}

	if (value instanceof Map) {
		return Object.fromEntries(Array.from(value.entries()));
	}

	if (typeof value === 'object') {
		// Handle MongoDB ObjectId (and similar BSON types) without importing mongoose here.
		if (
			(value && value._bsontype === 'ObjectID' && typeof value.toString === 'function') ||
			(value?.constructor?.name === 'ObjectId' && typeof value.toString === 'function')
		) {
			return value.toString();
		}

		const out = {};
		for (const [k, v] of Object.entries(value)) {
			out[k] = serializeForClient(v);
		}
		return out;
	}

	return value;
}

export default async function CreatorPage(props) {
	const params = await props.params;
	const creatorSlug = params?.id;

	if (!creatorSlug) {
		notFound();
	}

	await connectToDatabase();

	// Backward compatibility: a slug that matches a known userId wins,
	// otherwise resolve by metadata.displayName (shared helper, public
	// projection only).
	const resolved = await resolveCreatorByIdOrName(creatorSlug);
	if (!resolved) {
		notFound();
	}
	const resolvedUserId = resolved.userId;

	// Shop customisation — an explicit public allowlist (never spread the raw
	// subdocument, which could grow private fields later).
	const rawShop = resolved.shop || {};
	const blocksResult = validateBlocks(Array.isArray(rawShop.blocks) ? rawShop.blocks : []);
	const shop = {
		bannerImage: typeof rawShop.bannerImage === 'string' ? rawShop.bannerImage : '',
		logoImage: typeof rawShop.logoImage === 'string' ? rawShop.logoImage : '',
		description: typeof rawShop.description === 'string' ? rawShop.description : '',
		links: Array.isArray(rawShop.links)
			? rawShop.links
				.filter((l) => l && typeof l.label === 'string' && typeof l.url === 'string' && /^https?:\/\//i.test(l.url))
				.slice(0, 6)
				.map((l) => ({ label: l.label, url: l.url }))
			: [],
		featuredProductIds: Array.isArray(rawShop.featuredProductIds)
			? rawShop.featuredProductIds.slice(0, 8).map(String)
			: [],
		accentColor: typeof rawShop.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(rawShop.accentColor)
			? rawShop.accentColor
			: '',
		theme: normalizeTheme(rawShop.theme),
		blocks: blocksResult.ok ? blocksResult.blocks : [],
		published: rawShop.published !== false,
	};

	// Unpublished pages are visible to the owner and admins only.
	let viewerUserId = null;
	try {
		const session = await auth();
		viewerUserId = session?.userId || null;
	} catch {
		viewerUserId = null;
	}
	const isOwner = !!viewerUserId && viewerUserId === resolvedUserId;
	const isAdmin = !!viewerUserId && !isOwner ? await checkAdminPrivileges(viewerUserId) : false;
	if (!shop.published && !isOwner && !isAdmin) {
		notFound();
	}

	const products = await Product.find({ creatorUserId: resolvedUserId, hidden: { $ne: true }, flaggedForModeration: { $ne: true }, slug: { $nin: NON_PUBLIC_PRODUCT_SLUGS } }).sort({ createdAt: -1 }).lean();

	let profile = null;
	try {
		const client = await clerkClient();
		profile = await client.users.getUser(resolvedUserId);
	} catch {
		profile = null;
	}

	const joinedYear = (() => {
		const ts = profile?.createdAt;
		if (!ts) return null;
		const year = new Date(ts).getFullYear();
		return Number.isFinite(year) ? year : null;
	})();

	const creator = {
		id: resolvedUserId,
		displayName: resolved.displayName,
		imageUrl: profile?.imageUrl || null,
		role: resolved.role || 'Customer',
		joinedYear,
		shop,
	};

	const safeProducts = serializeForClient((products || []).filter(isPublicCatalogueProduct)
		.map(product => productForViewer(product, viewerUserId, isAdmin)).filter(Boolean)
		.map(product => ({ ...product, description: publicProductDescription(product.description) })));
	const textHtml = Object.fromEntries(shop.blocks.filter(block => block.type === 'text')
		.map(block => [block.id, renderPublicMarkdown(block.settings?.body)]));
	const metadata = creatorMetadata(resolved);
	const schema = metadata.robots?.index === false ? null : {
		'@context': 'https://schema.org', '@type': 'CollectionPage',
		name: resolved.displayName, description: metadata.description, url: metadata.alternates.canonical,
	};
	return <>
		{schema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(schema) }} />}
		<Creator creator={creator} products={safeProducts} textHtml={textHtml} canEdit={isAdmin} />
	</>;
}
