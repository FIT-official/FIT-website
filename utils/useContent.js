import { useState, useEffect } from 'react'

/**
 * Custom hook to fetch CMS content for any section
 * @param {string} contentPath - The path to the content (e.g., 'home/featured-section')
 * @param {object} defaultContent - Default content to use if fetch fails
 * @returns {object} { content, isLoading, error, refetch }
 */
export function useContent(contentPath, defaultContent = {}) {
    const [content, setContent] = useState(defaultContent)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(null)

    const fetchContent = async () => {
        if (!contentPath) {
            setContent(defaultContent)
            setIsLoading(false)
            return
        }

        try {
            setIsLoading(true)
            setError(null)

            const response = await fetch(`/api/content?path=${contentPath}`, {
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache',
                }
            })

            if (response.ok) {
                const data = await response.json()

                // Merge frontmatter and content into a flat object
                const mergedContent = {
                    ...defaultContent,
                    ...data.frontmatter,
                    content: data.content || defaultContent.content
                }

                setContent(mergedContent)
            } else {
                throw new Error(`Failed to fetch content: ${response.status}`)
            }
        } catch (err) {
            console.log(`Using default content for ${contentPath}:`, err.message)
            setError(err.message)
            setContent(defaultContent)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchContent()
    }, [contentPath])

    return {
        content,
        isLoading,
        error,
        refetch: fetchContent
    }
}

/**
 * Utility function to fetch content directly (for use in server components or one-off fetches)
 * @param {string} contentPath - The path to the content
 * @param {object} defaultContent - Default content to use if fetch fails
 * @returns {Promise<object>} The content object
 */
export async function fetchContent(contentPath, defaultContent = {}) {
    try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/content?path=${contentPath}`, {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache',
            }
        })

        if (response.ok) {
            const data = await response.json()

            return {
                ...defaultContent,
                ...data.frontmatter,
                content: data.content || defaultContent.content
            }
        } else {
            throw new Error(`Failed to fetch content: ${response.status}`)
        }
    } catch (error) {
        console.log(`Using default content for ${contentPath}:`, error.message)
        return defaultContent
    }
}