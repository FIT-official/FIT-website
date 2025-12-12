"use client"
import dynamic from 'next/dynamic'
import '@uiw/react-markdown-preview/markdown.css'
import React from 'react'


const Markdown = dynamic(
    () => import('@uiw/react-md-editor').then(mod => {
        return mod?.default?.Markdown || mod?.Markdown
    }),
    { ssr: false }
)

export default function MarkdownRenderer({ source, className = '' }) {
    if (!source) return null
    return (
        <div className={className} data-color-mode="light">
            <Markdown
                source={source}
                style={{ whiteSpace: 'pre-wrap' }}
                className="markdown-content"
            />
        </div>
    )
}
