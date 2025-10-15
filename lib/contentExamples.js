// EXAMPLE: How to use the content system in any component

import { useContent } from '@/utils/useContent'

// Example 1: Simple text content
function HeroSection() {
    const { content, isLoading } = useContent('home/hero-banner', {
        text: 'Welcome to our amazing platform!'
    })

    if (isLoading) return <div>Loading...</div>

    return (
        <div className="hero">
            <h1>{content.text}</h1>
        </div>
    )
}

// Example 2: Multiple fields
function AboutSection() {
    const { content } = useContent('about/introduction', {
        heading: 'About Us',
        subheading: 'We are awesome',
        description: 'This is our story...',
        content: 'Long form content here...'
    })

    return (
        <section>
            <h1>{content.heading}</h1>
            <h2>{content.subheading}</h2>
            <p>{content.description}</p>
            <div dangerouslySetInnerHTML={{ __html: content.content }} />
        </section>
    )
}

// Example 3: Shop page with fallbacks
function ShopHero() {
    const { content, error, refetch } = useContent('shop/hero', {
        title: 'Our Shop',
        subtitle: 'Find amazing products',
        description: 'Browse our collection of quality items.'
    })

    return (
        <div className="shop-hero">
            <h1>{content.title}</h1>
            <h2>{content.subtitle}</h2>
            <p>{content.description}</p>
            {error && (
                <button onClick={refetch} className="retry-btn">
                    Retry loading content
                </button>
            )}
        </div>
    )
}

// STEPS TO ADD NEW CONTENT:
// 1. Create MDX file: content/shop/hero/content.mdx
// 2. Add section to CMS: { id: 'shop/hero', name: 'Shop Hero', fields: ['title', 'subtitle', 'description'] }
// 3. Use hook: useContent('shop/hero', defaultValues)

export { HeroSection, AboutSection, ShopHero }