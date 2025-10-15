'use client'
import { useState, useEffect } from 'react'
import { useToast } from '@/components/General/ToastProvider'
import dynamic from 'next/dynamic'
import '@uiw/react-md-editor/markdown-editor.css'

// Dynamically import the markdown editor to avoid SSR issues
const MDEditor = dynamic(
    () => import('@uiw/react-md-editor').then((mod) => mod.default),
    { ssr: false }
)

const contentSections = [
    {
        id: 'home/featured-section',
        name: 'Home - Featured Section',
        description: 'Featured section on the homepage with title and content',
        fields: ['title', 'content']
    },
    {
        id: 'home/hero-banner',
        name: 'Home - Hero Banner',
        description: 'Banner text displayed at the top of the homepage',
        fields: ['text']
    },
    {
        id: 'about/introduction',
        name: 'About - Introduction Section',
        description: 'Main heading and description on the about page',
        fields: ['heading', 'subheading', 'description']
    },
    {
        id: 'about/services',
        name: 'About - Services Section',
        description: 'Services section heading and description',
        fields: ['heading', 'subheading', 'description']
    },
    {
        id: 'terms/content',
        name: 'Terms of Service',
        description: 'Complete terms of service content',
        fields: ['title', 'subtitle', 'content']
    },
    {
        id: 'privacy/content',
        name: 'Privacy Policy',
        description: 'Complete privacy policy content',
        fields: ['title', 'subtitle', 'content']
    }
]

export default function ContentManagement() {
    const { showToast } = useToast()
    const [selectedSection, setSelectedSection] = useState(contentSections[0].id)
    const [content, setContent] = useState(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        fetchContent()
    }, [selectedSection])

    const fetchContent = async () => {
        setIsLoading(true)
        try {
            const response = await fetch(`/api/admin/content?path=${selectedSection}`)
            if (!response.ok) {
                throw new Error('Failed to fetch content')
            }
            const data = await response.json()
            setContent(data)
        } catch (error) {
            showToast('Failed to load content: ' + error.message, 'error')
            // Initialize with empty content if fetch fails
            const section = contentSections.find(s => s.id === selectedSection)
            const emptyContent = {
                frontmatter: {},
                content: ''
            }
            section.fields.forEach(field => {
                emptyContent.frontmatter[field] = ''
            })
            setContent(emptyContent)
        } finally {
            setIsLoading(false)
        }
    }

    const handleSave = async () => {
        if (!content) return

        setIsSaving(true)
        try {
            const response = await fetch('/api/admin/content', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contentPath: selectedSection,
                    frontmatter: content.frontmatter,
                    content: content.content,
                }),
            })

            if (!response.ok) {
                throw new Error('Failed to save content')
            }

            showToast('Content saved successfully!', 'success')
        } catch (error) {
            showToast('Failed to save content: ' + error.message, 'error')
        } finally {
            setIsSaving(false)
        }
    }

    const updateField = (field, value) => {
        if (field === 'content') {
            setContent({
                ...content,
                content: value
            })
        } else {
            setContent({
                ...content,
                frontmatter: {
                    ...content.frontmatter,
                    [field]: value
                }
            })
        }
    }

    const currentSection = contentSections.find(s => s.id === selectedSection)

    return (
        <div className="space-y-6">
            {/* Section Selector */}
            <div className="bg-white border border-borderColor rounded-lg p-4">
                <div className="flex flex-col space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Select Content Section:
                        </label>
                        <select
                            value={selectedSection}
                            onChange={(e) => setSelectedSection(e.target.value)}
                            className="w-full px-3 py-2 border border-borderColor rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {contentSections.map((section) => (
                                <option key={section.id} value={section.id}>
                                    {section.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    {currentSection && (
                        <div className="text-xs text-gray-600 bg-gray-50 p-3 rounded">
                            <strong>Description:</strong> {currentSection.description}
                        </div>
                    )}
                </div>
            </div>

            {/* Content Editor */}
            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="loader" />
                </div>
            ) : content && currentSection ? (
                <div className="space-y-6">
                    <div className="bg-white border border-borderColor rounded-lg p-6">
                        <h2 className="text-xl font-semibold mb-4">
                            Editing: {currentSection.name}
                        </h2>

                        <div className="space-y-4">
                            {currentSection.fields.map((field) => {
                                if (field === 'content') {
                                    return (
                                        <div key={field}>
                                            <label className="block text-sm font-medium mb-2 capitalize">
                                                {field} {selectedSection.includes('terms') || selectedSection.includes('privacy') ? '(Rich Text Editor - HTML/Markdown)' : '(Markdown Editor)'}
                                            </label>
                                            <div className="border border-borderColor rounded-md overflow-hidden">
                                                <MDEditor
                                                    value={content.content || ''}
                                                    onChange={(value) => updateField('content', value || '')}
                                                    height={selectedSection.includes('terms') || selectedSection.includes('privacy') ? 500 : 300}
                                                    preview="edit"
                                                    hideToolbar={false}
                                                    visibleDragBar={false}
                                                    data-color-mode="light"
                                                    style={{
                                                        backgroundColor: 'white',
                                                    }}
                                                    textareaProps={{
                                                        placeholder: `Enter ${field} content here... You can use Markdown syntax or HTML tags.`,
                                                        style: {
                                                            fontSize: '14px',
                                                            lineHeight: '1.5',
                                                            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                                                        }
                                                    }}
                                                />
                                            </div>
                                            {selectedSection.includes('terms') || selectedSection.includes('privacy') ? (
                                                <div className="mt-2 text-xs text-gray-600 bg-blue-50 p-2 rounded">
                                                    <strong>Tip:</strong> This editor supports both Markdown and HTML. Use the toolbar for formatting, or write HTML directly for complex layouts. The preview tab shows how your content will appear.
                                                </div>
                                            ) : (
                                                <div className="mt-2 text-xs text-gray-600 bg-green-50 p-2 rounded">
                                                    <strong>Tip:</strong> Use Markdown syntax for formatting. The toolbar provides quick access to common formatting options.
                                                </div>
                                            )}
                                        </div>
                                    )
                                } else {
                                    return (
                                        <div key={field}>
                                            <label className="block text-sm font-medium mb-2 capitalize">
                                                {field.replace(/([A-Z])/g, ' $1').trim()}
                                            </label>
                                            {field === 'description' ? (
                                                <textarea
                                                    value={content.frontmatter[field] || ''}
                                                    onChange={(e) => updateField(field, e.target.value)}
                                                    rows={4}
                                                    className="w-full px-3 py-2 border border-borderColor rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    placeholder={`Enter ${field}...`}
                                                />
                                            ) : (
                                                <input
                                                    type="text"
                                                    value={content.frontmatter[field] || ''}
                                                    onChange={(e) => updateField(field, e.target.value)}
                                                    className="w-full px-3 py-2 border border-borderColor rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    placeholder={`Enter ${field}...`}
                                                />
                                            )}
                                        </div>
                                    )
                                }
                            })}

                            <div className="flex gap-4 pt-4">
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="formBlackButton disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSaving ? 'Saving...' : 'Save Changes'}
                                </button>

                                <button
                                    onClick={fetchContent}
                                    disabled={isLoading}
                                    className="formButton disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Reset
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="text-center py-12 bg-white border border-borderColor rounded-lg">
                    <p>Failed to load content. Please try again.</p>
                    <button
                        onClick={fetchContent}
                        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                        Retry
                    </button>
                </div>
            )}
        </div>
    )
}