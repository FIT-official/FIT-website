import { useState, useEffect } from 'react'
import { useToast } from '@/components/General/ToastProvider'
import TextInput from './CMSFields/TextInput'
import RichTextEditor from './CMSFields/RichTextEditor'
import ImageUpload from './CMSFields/ImageUpload'
import SelectField from './CMSFields/SelectField'
import { IoRefresh } from 'react-icons/io5'
import { MdOpenInNew } from 'react-icons/md'

const defaultContentSections = [
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
        fields: ['text', 'heroImage']
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
    const [contentSections, setContentSections] = useState(defaultContentSections)
    const [selectedSection, setSelectedSection] = useState(defaultContentSections[0].id)
    const [content, setContent] = useState(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [previewKey, setPreviewKey] = useState(Date.now())

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
            setPreviewKey(Date.now())
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

    const renderField = (field, value, onChange) => {
        const isContentField = field === 'content'
        const isComplexContent = selectedSection.includes('terms') || selectedSection.includes('privacy')

        if (isContentField) {
            return (
                <RichTextEditor
                    key={field}
                    label={field.charAt(0).toUpperCase() + field.slice(1)}
                    value={value}
                    onChange={onChange}
                    height={isComplexContent ? 500 : 300}
                    showHtmlTip={isComplexContent}
                />
            )
        }

        // image field detection: prefer explicit frontmatter fieldMeta, fallback to naming heuristic
        const getFieldMeta = (f) => {
            try {
                return content?.frontmatter?.fieldMeta?.[f] || null
            } catch (e) {
                return null
            }
        }

        const isImageField = (f) => {
            const meta = getFieldMeta(f)
            if (meta) return meta.type === 'image' || meta.type === 'images'
            const name = f.toLowerCase()
            return name.includes('image') || name.includes('photo') || name.includes('avatar')
        }

        if (isImageField(field)) {
            const meta = getFieldMeta(field) || {}
            // uploadPath helps group uploads (e.g. 'home/featured'), default to selectedSection
            const uploadPath = meta.uploadPath || selectedSection
            // use a dedicated admin upload endpoint so these do not mix with product uploads
            const uploadEndpoint = meta.uploadEndpoint || '/api/admin/upload/images'

            return (
                <ImageUpload
                    key={field}
                    label={field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1')}
                    value={value}
                    onChange={onChange}
                    uploadPath={uploadPath}
                    uploadEndpoint={uploadEndpoint}
                />
            )
        }

        if (field.toLowerCase().includes('description') || field.toLowerCase().includes('subtitle') || field.toLowerCase().includes('text')) {
            return (
                <TextInput
                    key={field}
                    label={field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1')}
                    value={value}
                    onChange={onChange}
                    rows={field.toLowerCase().includes('description') ? 3 : 1}
                />
            )
        }

        return (
            <TextInput
                key={field}
                label={field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1')}
                value={value}
                onChange={onChange}
            />
        )
    }



    const currentSection = contentSections.find(s => s.id === selectedSection)

    const getPreviewPath = (sectionId) => {
        if (!sectionId) return '/'
        if (sectionId.startsWith('home/')) return '/'
        if (sectionId.startsWith('about/')) return '/about'
        if (sectionId.startsWith('terms/')) return '/terms'
        if (sectionId.startsWith('privacy/')) return '/privacy'
        if (sectionId.startsWith('shop/')) return '/shop'
        if (sectionId.startsWith('products/')) return '/products'
        if (sectionId.startsWith('creators/')) return '/creators'
        if (sectionId.startsWith('prints/')) return '/prints'
        if (sectionId.startsWith('dashboard/')) return '/dashboard'
        if (sectionId.startsWith('onboarding/')) return '/onboarding'
        if (sectionId.startsWith('account/')) return '/account'
        return '/'
    }

    const previewUrl = `${getPreviewPath(selectedSection)}?previewKey=${previewKey}`

    return (
        <div className="flex gap-4 flex-col p-6 md:p-12 bg-borderColor/60">
            <div className="adminDashboardContainer">
                <h3>
                    Choose some content to edit.
                </h3>
                <select
                    value={selectedSection}
                    onChange={(e) => setSelectedSection(e.target.value)}
                    className="w-full px-2 font-normal font- py-1 border border-borderColor bg-borderColor/40 rounded-sm text-sm outline-none"
                >
                    {contentSections.map((section) => (
                        <option key={section.id} value={section.id}>
                            {section.name}
                        </option>
                    ))}
                </select>

                {currentSection && (
                    <div className="text-xs font-normal bg-borderColor/30 p-3 rounded">
                        <strong>What is this?</strong> {currentSection.description}
                        <br />
                    </div>
                )}

            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="loader" />
                </div>
            ) : content && currentSection ? (
                <div className="adminDashboardContainer">

                    <h3>
                        You're editing <span className='text-textColor'>"{currentSection.name}"</span>
                    </h3>

                    <div className="gap-6 flex flex-col">
                        {currentSection.fields.map((field) => {
                            const value = field === 'content' ? content.content : content.frontmatter[field]
                            const onChange = (newValue) => updateField(field, newValue)

                            return renderField(field, value, onChange)
                        })}

                        <div className="flex gap-4">
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
            ) : (
                <div className="adminDashboardContainer items-center justify-center text-center">
                    <p className='text-xs font-medium text-center'>Failed to load content. Please try again.</p>
                </div>
            )}
            <div className="adminDashboardContainer">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h3 className="font-semibold">Preview</h3>
                        <p className="text-xs text-gray-600">This shows the actual page using the last saved content. Save changes, then refresh if needed.</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPreviewKey(Date.now())}
                            className="formButton"
                            type="button"
                        >
                            <IoRefresh />
                        </button>
                        <a
                            href={previewUrl || '#'}
                            target="_blank"
                            rel="noreferrer"
                            className="formBlackButton"
                        >
                            <MdOpenInNew />
                        </a>
                    </div>
                </div>
                <div className="relative w-full border border-dashed border-borderColor rounded-md overflow-hidden bg-gray-50">
                    {previewUrl ? (
                        <iframe
                            key={previewKey}
                            src={previewUrl}
                            title="Content Preview"
                            className="w-full"
                            style={{ height: 600, border: '0' }}
                        />
                    ) : (
                        <div className="p-6 text-sm text-gray-600">Preview unavailable.</div>
                    )}
                </div>
            </div>
        </div>
    )
}