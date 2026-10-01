/** @type {import('next').NextConfig} */
const nextConfig = {
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
            ['esp32-wroomdevkit-30pin-2', 'esp32-wroomdevkit-30pin'],
            ['esp32-wroomdevkit-30pin-3', 'esp32-wroomdevkit-30pin'],
            ['copper-stripboard-65145cm-254mm-2', 'copper-stripboard-65145cm-254mm'],
            ['tft-ili9341-240-x-320-28-inch-2', 'tft-ili9341-240-x-320-28-inch'],
        ].map(([from, to]) => ({ source: `/products/${from}`, destination: `/products/${to}`, permanent: true }));
    },
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    {
                        key: "Content-Security-Policy",
                        value: "frame-ancestors 'self' https://pay.google.com; frame-src 'self' https://pay.google.com https://js.stripe.com https://challenges.cloudflare.com https://www.google.com/shopping/customerreviews/optin; ",
                    },
                ],
            },
        ];
    },
};

export default nextConfig;
