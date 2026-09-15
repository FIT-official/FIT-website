import Creator from "./Creator";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import Product from "@/models/Product";
import { clerkClient } from "@clerk/nextjs/server";

export const metadata = {
	title: "Creator | Fix It Today®",
	description: "Browse this creator's products at Fix It Today®",
};

const normalizeDisplayName = (value) => {
	if (typeof value !== 'string') return '';
	return value.trim().replace(/\s+/g, ' ');
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isLikelyClerkUserId = (value) => typeof value === 'string' && /^user_[a-zA-Z0-9]+$/.test(value);

const sanitizeDisplayName = (value, fallback = 'Unnamed Store') => {
	if (typeof value !== 'string') return fallback;
	const trimmed = value.trim();
	if (!trimmed) return fallback;
	if (isLikelyClerkUserId(trimmed)) return fallback;
	return trimmed;
};

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
		return (
			<div className="flex min-h-[92vh] w-full items-center justify-center border-b border-borderColor">
				<div className="text-sm text-lightColor">Creator not found.</div>
			</div>
		);
	}

	await connectToDatabase();

	const decodedSlug = (() => {
		try {
			return decodeURIComponent(String(creatorSlug));
		} catch {
			return String(creatorSlug);
		}
	})();
	const normalizedSlug = normalizeDisplayName(decodedSlug);

	// Backward compatibility:
	// - if the slug matches a known userId, use it
	// - otherwise, resolve by metadata.displayName
	// Public-safe fields ONLY: display name, role, and the shop customisation
	// subdocument. Never widen this projection to carts/orders/contact details.
	const baseProjection = { "metadata.displayName": 1, "metadata.role": 1, userId: 1, shop: 1, _id: 0 };
	const byUserId = await User.findOne({ userId: normalizedSlug }, baseProjection).lean();
	const byDisplayName = !byUserId
		? await User.findOne(
			{ "metadata.displayName": { $regex: `^${escapeRegex(normalizedSlug)}$`, $options: 'i' } },
			baseProjection
		).lean()
		: null;

	const resolvedUserId = byUserId?.userId || byDisplayName?.userId || null;
	const mongoUser = byUserId || byDisplayName || null;

	if (!resolvedUserId) {
		return (
			<div className="flex min-h-[92vh] w-full items-center justify-center border-b border-borderColor">
				<div className="text-sm text-lightColor">Creator not found.</div>
			</div>
		);
	}

	const products = await Product.find({ creatorUserId: resolvedUserId, hidden: { $ne: true }, flaggedForModeration: { $ne: true } }).sort({ createdAt: -1 }).lean();

	let profile = null;
	try {
		const client = await clerkClient();
		profile = await client.users.getUser(resolvedUserId);
	} catch {
		profile = null;
	}

	const displayName = sanitizeDisplayName(mongoUser?.metadata?.displayName, 'Unnamed Store');

	// Shop customisation — an explicit public allowlist (never spread the raw
	// subdocument, which could grow private fields later).
	const rawShop = mongoUser?.shop || {};
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
	};

	const joinedYear = (() => {
		const ts = profile?.createdAt;
		if (!ts) return null;
		const year = new Date(ts).getFullYear();
		return Number.isFinite(year) ? year : null;
	})();

	const creator = {
		id: resolvedUserId,
		displayName,
		imageUrl: profile?.imageUrl || null,
		role: mongoUser?.metadata?.role || 'Customer',
		joinedYear,
		shop,
	};

	const safeProducts = serializeForClient(products || []);
	return <Creator creator={creator} products={safeProducts} />;
}
