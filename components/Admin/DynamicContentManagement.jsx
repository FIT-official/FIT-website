import { useState, useEffect } from 'react'
import { useToast } from '@/components/General/ToastProvider'
import TextInput from './CMSFields/TextInput'
import RichTextEditor from './CMSFields/RichTextEditor'
import ImageUpload from './CMSFields/ImageUpload'
import SelectField from './CMSFields/SelectField'
import ArrayField from './CMSFields/ArrayField'
import ProductSearch from './CMSFields/ProductSearch'
import CategoryInput from './CMSFields/CategoryInput'
import { IoRefresh } from 'react-icons/io5'
import { MdOpenInNew } from 'react-icons/md'

const defaultContentSections = [
    {
        id: 'home/featured-section',
        name: 'Home - Featured Section',
        description: 'Featured section with title, content, and product display options (choose by category or custom list)',
        fields: ['title', 'content', 'productType', 'displayMode', 'category', 'subcategory', 'customProducts']
    },
    {
        id: 'home/hero-banner',
        name: 'Home - Hero Banner',
        description: 'Banner text displayed at the top of the homepage',
        fields: ['text', 'heroImage']
    },
    {
        id: 'home/ad-banner',
        name: 'Home - Ad Banner',
        description: 'Top banner text displayed above the hero section',
        fields: ['text']
    },
    {
        id: 'home/testimonials',
        name: 'Home - Testimonials',
        description: 'Customer testimonials with name, role, text, and avatar',
        fields: ['testimonials']
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
        id: 'about/services-list',
        name: 'About - Services List',
        description: 'List of services with images, titles, and descriptions',
        fields: ['services']
    },
    {
        id: 'about/benefits',
        name: 'About - Benefits Section',
        description: 'Benefits section with benefit cards (background image is fixed)',
        fields: ['benefits']
    },
    {
        id: 'shop/banner',
        name: 'Shop - Banner',
        description: 'Background banner image displayed at the top of the shop page',
        fields: ['bannerImage']
    },
    {
        id: 'prints/banner',
        name: 'Prints - Banner',
        description: 'Background banner image displayed at the top of the prints page',
        fields: ['bannerImage']
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

        const isArrayField = (f) => {
            const meta = getFieldMeta(f)
            return meta?.type === 'array' || Array.isArray(value)
        }

        // Handle array fields (testimonials, services, benefits, etc.)
        if (isArrayField(field)) {
            const meta = getFieldMeta(field) || {}
            return (
                <ArrayField
                    key={field}
                    label={field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1')}
                    value={value}
                    onChange={onChange}
                    fieldMeta={meta}
                />
            )
        }

        if (isImageField(field)) {
            const meta = getFieldMeta(field) || {}
            // uploadPath helps group uploads (e.g. 'home/featured'), default to selectedSection
            const uploadPath = meta.uploadPath || selectedSection
            // use a dedicated admin upload endpoint so these do not mix with product uploads
            const uploadEndpoint = meta.uploadEndpoint || '/api/admin/upload/images'

            // Cropping configuration: prefer explicit fieldMeta, fall back to
            // sensible defaults based on the section and field name.
            let cropAspectRatio = meta.aspectRatio || null
            let targetWidth = meta.width || null
            let targetHeight = meta.height || null

            // Shop / Prints banners use a wide 16:5 hero-style banner
            if (!cropAspectRatio && (selectedSection === 'shop/banner' || selectedSection === 'prints/banner') && field === 'bannerImage') {
                cropAspectRatio = 16 / 5
            }

            return (
                <ImageUpload
                    key={field}
                    label={field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1')}
                    value={value}
                    onChange={onChange}
                    uploadPath={uploadPath}
                    uploadEndpoint={uploadEndpoint}
                    cropAspectRatio={cropAspectRatio}
                    targetWidth={targetWidth}
                    targetHeight={targetHeight}
                />
            )
        }

        if (field === 'displayMode') {
            const currentMode = value || 'category'
            return (
                <div key={field} className="space-y-2">
                    <label className="formLabel">Display Mode</label>
                    <p className="text-xs text-lightColor -mt-1">Choose how to select which products to display</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                        <button
                            type="button"
                            onClick={() => onChange('category')}
                            className={`p-3 sm:p-4 rounded-lg border border-borderColor transition-all text-left ${currentMode === 'category'
                                ? 'bg-textColor/5'
                                : 'bg-baseColor hover:border-textColor/20'
                                }`}
                        >
                            <div className="font-medium text-xs sm:text-sm mb-1">By Category</div>
                            <div className="text-xs text-lightColor">
                                Show products from a specific category/subcategory
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => onChange('custom')}
                            className={`p-3 sm:p-4 rounded-lg border transition-all text-left border-borderColor ${currentMode === 'custom'
                                ? 'bg-textColor/5'
                                : 'bg-baseColor hover:border-textColor/20'
                                }`}
                        >
                            <div className="font-medium text-xs sm:text-sm mb-1">Custom List</div>
                            <div className="text-xs text-lightColor">
                                Hand-pick specific products in any order
                            </div>
                        </button>
                    </div>
                </div>
            )
        }

        if (field === 'productType') {
            const currentType = value || 'print'
            return (
                <div key={field} className="space-y-2">
                    <label className="formLabel">Product Type</label>
                    <p className="text-xs text-lightColor -mt-1">Choose whether to feature print products or shop products.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                        <button
                            type="button"
                            onClick={() => onChange('print')}
                            className={`p-3 sm:p-4 rounded-lg border border-borderColor transition-all text-left ${currentType === 'print'
                                ? 'bg-textColor/5'
                                : 'bg-baseColor hover:border-textColor/20'
                                }`}
                        >
                            <div className="font-medium text-xs sm:text-sm mb-1">Print Products</div>
                            <div className="text-xs text-lightColor">
                                Use categories from your prints catalogue.
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => onChange('shop')}
                            className={`p-3 sm:p-4 rounded-lg border transition-all text-left border-borderColor ${currentType === 'shop'
                                ? 'bg-textColor/5'
                                : 'bg-baseColor hover:border-textColor/20'
                                }`}
                        >
                            <div className="font-medium text-xs sm:text-sm mb-1">Shop Products</div>
                            <div className="text-xs text-lightColor">
                                Use categories from your shop catalogue.
                            </div>
                        </button>
                    </div>
                </div>
            )
        }

        // Handle category and subcategory fields
        if (field === 'category' || field === 'subcategory') {
            const displayMode = content?.frontmatter?.displayMode || 'category'
            if (displayMode !== 'category') return null

            const featuredProductType = content?.frontmatter?.productType || null

            return (
                <CategoryInput
                    key={field}
                    label={field.charAt(0).toUpperCase() + field.slice(1)}
                    value={value || ''}
                    onChange={onChange}
                    placeholder={field === 'category' ? 'e.g., Trending Prints' : 'e.g., Popular'}
                    helpText={field === 'category'
                        ? 'Start typing to see existing categories or enter a new one'
                        : 'Start typing to see existing subcategories or enter a new one'}
                    type={field}
                    productType={featuredProductType}
                />
            )
        }

        // Handle customProducts field
        if (field === 'customProducts') {
            const displayMode = content?.frontmatter?.displayMode || 'category'
            if (displayMode !== 'custom') return null

            return (
                <ProductSearch
                    key={field}
                    label="Select Products"
                    value={value || ''}
                    onChange={onChange}
                    helpText="Search and select products by name. Drag to reorder them - the order here is the display order on your site."
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
                <div>
                    <h3 className="mb-1">Content Management</h3>
                    <p className="text-xs">
                        Select a section to edit its content, then preview and save your changes.
                    </p>
                </div>

                <div className="flex flex-col mt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
                        {contentSections.map((section) => (
                            <button
                                key={section.id}
                                type="button"
                                onClick={() => setSelectedSection(section.id)}
                                className={`p-3 sm:p-4 rounded-lg border transition-all text-left ${selectedSection === section.id
                                    ? 'border-textColor/0 bg-textColor/5 ring-1 ring-textColor/10'
                                    : 'border-borderColor/60 bg-white hover:border-textColor/20 hover:bg-baseColor/50'
                                    }`}
                            >
                                <div className="font-medium text-xs sm:text-sm mb-1 text-textColor">{section.name}</div>
                                <div className="text-xs text-lightColor/80 line-clamp-2">
                                    {section.description}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="loader" />
                </div>
            ) : content && currentSection ? (
                <div className="adminDashboardContainer">

                    <div>
                        <h3 className='mb-1 text-base sm:text-lg'>
                            You're editing <span className='text-textColor'>"{currentSection.name}"</span>
                        </h3>
                        <p className="text-xs text-gray-600">
                            Make changes to the fields below and click "Save Changes" to update the content.
                        </p>
                    </div>

                    <div className="gap-6 sm:gap-8 flex flex-col p-4 sm:p-6 w-full border border-dashed border-borderColor rounded-md overflow-hidden bg-gray-50">
                        {currentSection.fields.map((field) => {
                            const value = field === 'content' ? content.content : content.frontmatter[field]
                            const onChange = (newValue) => updateField(field, newValue)

                            return renderField(field, value, onChange)
                        })}

                        <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-4">
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="formBlackButton disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                            >
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>

                            {/* Hide the generic section reset when editing banner sections
                                so the only reset action there is the image field's
                                "Reset to placeholder" button. */}
                            {!(selectedSection === 'shop/banner' || selectedSection === 'prints/banner') && (
                                <button
                                    onClick={fetchContent}
                                    disabled={isLoading}
                                    className="formButton disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                                >
                                    Reset
                                </button>
                            )}
                        </div>
                    </div>

                </div>
            ) : (
                <div className="adminDashboardContainer items-center justify-center text-center">
                    <p className='text-xs font-medium text-center'>Failed to load content. Please try again.</p>
                </div>
            )}
            <div className="adminDashboardContainer">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                    <div>
                        <h3 className="font-semibold text-base sm:text-lg">Preview</h3>
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
                            style={{ height: '400px', border: '0' }}
                        />
                    ) : (
                        <div className="p-6 text-sm text-gray-600">Preview unavailable.</div>
                    )}
                </div>
            </div>
        </div>
    )
}