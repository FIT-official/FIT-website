/** @type {import('next').NextConfig} */
const nextConfig = {
    // Silence Next.js 16 warning about having a webpack config
    // without a Turbopack config. We don't need any special
    // Turbopack settings right now, so an empty object is fine.
    turbopack: {},
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
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    {
                        key: "Content-Security-Policy",
                        value: "frame-ancestors 'self' https://pay.google.com; frame-src 'self' https://pay.google.com https://js.stripe.com https://challenges.cloudflare.com; ",
                    },
                ],
            },
        ];
    },
};

export default nextConfig;
