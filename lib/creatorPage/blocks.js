import { sanitizeString } from "@/utils/validate";

// Creator page blocks — the server-side contract for `User.shop.blocks`.
// Every block is `{ id, type, settings }`; `validateBlocks` is the single
// authority on which types exist and how their settings are bounded, and it
// returns a sanitised copy the API stores verbatim. The dashboard builder and
// the public renderer both import BLOCK_TYPES/DEFAULT_BLOCKS from here so
// the three surfaces cannot drift.

export const MAX_BLOCKS = 12;
export const MAX_GALLERY_IMAGES = 8;
export const PRODUCTS_LIMIT = { min: 4, max: 24 };

export const THEME_MODES = ["light", "dark"];
export const THEME_FONTS = ["sans", "serif", "mono"];
export const DEFAULT_THEME = Object.freeze({ mode: "light", font: "sans" });

const BLOCK_ID = /^[a-z0-9]{8,16}$/;
// Same charset the shop image routes accept; ownership of the prefix is
// enforced by the API (it knows the caller's userId), not here.
const S3_KEY_CHARSET = /^[a-zA-Z0-9_\-/.]+$/;

// Ordered so the builder's "Add block" menu reads sensibly.
export const BLOCK_TYPES = [
    { type: "hero", label: "Hero", description: "Banner, logo, name and your description." },
    { type: "text", label: "Information", description: "A heading and a paragraph of information (Markdown)." },
    { type: "gallery", label: "Gallery", description: "Up to 8 photos of your work." },
    { type: "products", label: "Products", description: "Your products, all or featured." },
    { type: "printService", label: "Print service", description: "Your custom print service, if enabled." },
    { type: "links", label: "Links", description: "Your external links as chips." },
    { type: "contact", label: "Contact", description: "A short blurb and a Message button." },
];

const TYPE_SET = new Set(BLOCK_TYPES.map((b) => b.type));

const DEFAULT_SETTINGS = {
    hero: () => ({ headline: "", subheadline: "", showBanner: true, showLogo: true }),
    text: () => ({ heading: "", body: "" }),
    gallery: () => ({ heading: "", images: [] }),
    products: () => ({ heading: "", mode: "all", limit: PRODUCTS_LIMIT.max }),
    printService: () => ({ heading: "" }),
    links: () => ({ heading: "" }),
    contact: () => ({ heading: "", blurb: "", showMessageButton: true }),
};

export const defaultSettingsFor = (type) => (DEFAULT_SETTINGS[type] ? DEFAULT_SETTINGS[type]() : {});

// 12 chars of [a-z0-9]; crypto when available (browser + node), Math.random
// fallback keeps the shape identical.
export function newBlockId() {
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    const cryptoObj = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
    if (cryptoObj?.getRandomValues) {
        const bytes = new Uint8Array(12);
        cryptoObj.getRandomValues(bytes);
        for (const b of bytes) out += alphabet[b % alphabet.length];
        return out;
    }
    for (let i = 0; i < 12; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    return out;
}

export const makeBlock = (type, settings = {}) => ({
    id: newBlockId(),
    type,
    settings: { ...defaultSettingsFor(type), ...settings },
});

// What an existing shop renders when it has never touched the builder. Fixed
// ids keep the builder's keys stable across reloads.
export const DEFAULT_BLOCKS = Object.freeze([
    { id: "defaulthero", type: "hero", settings: { headline: "", subheadline: "", showBanner: true, showLogo: true } },
    { id: "defaultprods", type: "products", settings: { heading: "", mode: "all", limit: 24 } },
    { id: "defaultlinks", type: "links", settings: { heading: "" } },
    { id: "defaultcontact", type: "contact", settings: { heading: "", blurb: "", showMessageButton: true } },
]);

// Deep copy so callers (the builder's in-memory state) can mutate freely.
export const cloneDefaultBlocks = () => DEFAULT_BLOCKS.map((b) => ({ ...b, settings: { ...b.settings } }));

const str = (value, max) => {
    if (value === undefined || value === null) return "";
    if (typeof value !== "string") return null;
    return sanitizeString(value).slice(0, max);
};

const bool = (value, fallback) => (typeof value === "boolean" ? value : fallback);

const fail = (error) => ({ ok: false, blocks: [], error });

// Per-type settings validators: return the sanitised settings or a string error.
const SETTINGS = {
    hero(s) {
        const headline = str(s.headline, 80);
        const subheadline = str(s.subheadline, 160);
        if (headline === null || subheadline === null) return "hero text fields must be strings";
        return { headline, subheadline, showBanner: bool(s.showBanner, true), showLogo: bool(s.showLogo, true) };
    },
    text(s) {
        const heading = str(s.heading, 80);
        const body = str(s.body, 2000);
        if (heading === null || body === null) return "text fields must be strings";
        return { heading, body };
    },
    gallery(s) {
        const heading = str(s.heading, 80);
        if (heading === null) return "gallery heading must be a string";
        const raw = s.images === undefined ? [] : s.images;
        if (!Array.isArray(raw)) return "gallery images must be an array";
        if (raw.length > MAX_GALLERY_IMAGES) return `gallery allows at most ${MAX_GALLERY_IMAGES} images`;
        const images = [];
        for (const key of raw) {
            if (typeof key !== "string" || !key || key.length > 300 || !S3_KEY_CHARSET.test(key) || key.includes("..")) {
                return "invalid gallery image key";
            }
            images.push(key);
        }
        return { heading, images };
    },
    products(s) {
        const heading = str(s.heading, 80);
        if (heading === null) return "products heading must be a string";
        const mode = s.mode === undefined ? "all" : s.mode;
        if (mode !== "all" && mode !== "featured") return "products mode must be all or featured";
        const limitRaw = s.limit === undefined ? PRODUCTS_LIMIT.max : Number(s.limit);
        if (!Number.isInteger(limitRaw) || limitRaw < PRODUCTS_LIMIT.min || limitRaw > PRODUCTS_LIMIT.max) {
            return `products limit must be between ${PRODUCTS_LIMIT.min} and ${PRODUCTS_LIMIT.max}`;
        }
        return { heading, mode, limit: limitRaw };
    },
    printService(s) {
        const heading = str(s.heading, 80);
        if (heading === null) return "printService heading must be a string";
        return { heading };
    },
    links(s) {
        const heading = str(s.heading, 80);
        if (heading === null) return "links heading must be a string";
        return { heading };
    },
    contact(s) {
        const heading = str(s.heading, 80);
        const blurb = str(s.blurb, 300);
        if (heading === null || blurb === null) return "contact text fields must be strings";
        return { heading, blurb, showMessageButton: bool(s.showMessageButton, true) };
    },
};

/**
 * Validate and sanitise a blocks array.
 * @returns {{ ok: boolean, blocks: Array, error?: string }}
 */
export function validateBlocks(blocks) {
    if (!Array.isArray(blocks)) return fail("blocks must be an array");
    if (blocks.length > MAX_BLOCKS) return fail(`at most ${MAX_BLOCKS} blocks`);

    const seen = new Set();
    const out = [];
    for (const block of blocks) {
        if (!block || typeof block !== "object" || Array.isArray(block)) return fail("each block must be an object");
        const { id, type } = block;
        if (typeof type !== "string" || !TYPE_SET.has(type)) return fail(`unknown block type: ${String(type)}`);
        if (typeof id !== "string" || !BLOCK_ID.test(id)) return fail("block id must be 8-16 chars of [a-z0-9]");
        if (seen.has(id)) return fail("duplicate block id");
        seen.add(id);

        const settingsIn = block.settings === undefined || block.settings === null ? {} : block.settings;
        if (typeof settingsIn !== "object" || Array.isArray(settingsIn)) return fail("block settings must be an object");
        const result = SETTINGS[type](settingsIn);
        if (typeof result === "string") return fail(result);
        out.push({ id, type, settings: result });
    }
    return { ok: true, blocks: out };
}

/** Normalise a theme object; unknown values fall back to the defaults. */
export function normalizeTheme(theme) {
    const mode = THEME_MODES.includes(theme?.mode) ? theme.mode : DEFAULT_THEME.mode;
    const font = THEME_FONTS.includes(theme?.font) ? theme.font : DEFAULT_THEME.font;
    return { mode, font };
}
