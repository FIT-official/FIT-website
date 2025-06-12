/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'fixittoday.s3.amazonaws.com',
                pathname: '/**',
            },
        ],
    },
};

export default nextConfig;
