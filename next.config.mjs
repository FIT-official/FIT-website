import { publicProductImages } from './lib/publicProductImages.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
    env: {
        NEXT_PUBLIC_PRODUCT_IMAGE_PATHS: JSON.stringify(publicProductImages()),
    },
    poweredByHeader: false,
    // Keep metadata blocking for browsers and crawlers. Route content must also
    // stay outside layout Suspense boundaries so notFound can set HTTP 404.
    htmlLimitedBots: /.*/,
    // Silence Next.js 16 warning about having a webpack config
    // without a Turbopack config. We don't need any special
    // Turbopack settings right now, so an empty object is fine.
    turbopack: {},
    // Clerk middleware makes every request body buffer through the proxy,
    // whose default cap is 10MB. Print-time calibration uploads whole models
    // (route enforces its own 40MB Content-Length guard), so match that here.
    experimental: {
        middlewareClientMaxBodySize: '40mb',
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'img.clerk.com',
                port: '',
                pathname: '**',
                search: '',
            },
            {
                protocol: 'https',
                hostname: 'fixittoday.s3.amazonaws.com',
                pathname: '/**',
            },
        ],
        // Allow using the internal /api/proxy route with a `key` query
        // (e.g. /api/proxy?key=admin/uploads/home/hero/....jpg) in <Image />
        localPatterns: [
            {
                pathname: '/api/proxy',
                search: 'key=*',
            },
            // Allow all other static assets under /public (e.g. /user.jpg)
            {
                pathname: '/**',
            },
        ],
    },
    webpack: (config, { isServer }) => {
        // Handle gltfjsx and other AST parsing libraries
        config.resolve.fallback = {
            ...config.resolve.fallback,
            fs: false,
            path: false,
            os: false,
        }

        // Exclude problematic libraries from client-side bundle
        if (!isServer) {
            config.resolve.alias = {
                ...config.resolve.alias,
                '@babel/parser': false,
                '@babel/traverse': false,
                '@babel/types': false,
                'gltfjsx': false,
            }
        }

        return config
    },
    async rewrites() {
        return [
            {
                source: '/ingest/static/:path*',
                destination: 'https://us-assets.i.posthog.com/static/:path*',
            },
            {
                source: '/ingest/array/:path*',
                destination: 'https://us-assets.i.posthog.com/array/:path*',
            },
            {
                source: '/ingest/:path*',
                destination: 'https://us.i.posthog.com/:path*',
            },
        ];
    },
    skipTrailingSlashRedirect: true,
    async redirects() {
        return [
            ['bambu-lab-3d-printing-filament-1kg-pva-support', 'bambu-lab-3d-printing-filament-05kg-pva-support'],
            ['esp32-wroomdevkit-30pin-2', 'esp32-wroomdevkit-30pin'],
            ['esp32-wroomdevkit-30pin-3', 'esp32-wroomdevkit-30pin'],
            ['copper-stripboard-65145cm-254mm-2', 'copper-stripboard-65145cm-254mm'],
            ['tft-ili9341-240-x-320-28-inch-2', 'tft-ili9341-240-x-320-28-inch'],
        ].map(([from, to]) => ({ source: `/products/${from}`, destination: `/products/${to}`, permanent: true }));
    },
    async headers() {
        const unlistedHeaders = (process.env.UNLISTED_BLOG_SLUGS || '').split(',')
            .map(slug => slug.trim()).filter(slug => /^[a-z0-9-]+$/.test(slug))
            .map(slug => ({ source: `/blog/${slug}`, headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }));
        return [
            ...unlistedHeaders,
            {
                source: "/(.*)",
                headers: [
                    {
                        key: "Content-Security-Policy",
                        value: "frame-ancestors 'self' https://pay.google.com; frame-src 'self' https://pay.google.com https://js.stripe.com https://challenges.cloudflare.com https://www.google.com/shopping/customerreviews/optin; ",
                    },
                    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com" "https://pay.google.com")' },
                    {
                        key: 'Content-Security-Policy-Report-Only',
                        value: [
                            "default-src 'self'",
                            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://clerk.fixitoday.com https://*.clerk.com https://js.stripe.com https://us.i.posthog.com https://us-assets.i.posthog.com https://pay.google.com https://www.googletagmanager.com https://www.google-analytics.com https://www.google.com https://www.gstatic.com https://challenges.cloudflare.com",
                            "style-src 'self' 'unsafe-inline'",
                            "img-src 'self' data: blob: https:",
                            "font-src 'self' data: https:",
                            "connect-src 'self' https: wss:",
                            "worker-src 'self' blob:",
                            "frame-src 'self' https://pay.google.com https://js.stripe.com https://challenges.cloudflare.com https://www.google.com/shopping/customerreviews/optin",
                            "frame-ancestors 'self' https://pay.google.com",
                            "object-src 'none'",
                            "base-uri 'self'",
                        ].join('; ') + ';',
                    },
                ],
            },
        ];
    },
};

export default nextConfig;
