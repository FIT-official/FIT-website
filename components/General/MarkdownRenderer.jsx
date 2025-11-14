"use client"
import dynamic from 'next/dynamic'
import '@uiw/react-markdown-preview/markdown.css'
import React from 'react'

// Dynamically import the editor to access its Markdown renderer on the client only.
const MDEditor = dynamic(
    () => import('@uiw/react-md-editor').then(mod => mod.default),
    { ssr: false }
)

/**
 * MarkdownRenderer
 * Renders Markdown (including **bold**, *italic*, lists, etc.) produced by the Admin editor.
 * Use for any frontmatter/content field that stores markdown text.
 *
 * Props:
 * - source: string markdown/MDX (basic HTML inline is also supported)
 * - className: optional wrapper styling
 */
export default function MarkdownRenderer({ source, className = '' }) {
    if (!source) return null
    return (
        <div className={className} data-color-mode="light">
            {/* whiteSpace: 'pre-wrap' preserves intentional line breaks */}
            <MDEditor.Markdown source={source} style={{ whiteSpace: 'pre-wrap' }} />
        </div>
    )
}
