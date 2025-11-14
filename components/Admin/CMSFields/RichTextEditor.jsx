import dynamic from 'next/dynamic'
import '@uiw/react-md-editor/markdown-editor.css'
import { useRef, useState } from 'react'

const MDEditor = dynamic(
    () => import('@uiw/react-md-editor').then((mod) => mod.default),
    { ssr: false }
)

export default function RichTextEditor({
    label,
    value,
    onChange,
    placeholder,
    required = false,
    disabled = false,
    className = "",
    height = 300,
    showHtmlTip = false
}) {
    const fileInputRef = useRef(null)
    const [uploading, setUploading] = useState(false)

    const handleUploadClick = () => {
        if (disabled) return
        fileInputRef.current?.click()
    }

    const handleFilesSelected = async (e) => {
        const files = Array.from(e.target.files || [])
        if (!files.length) return
        try {
            setUploading(true)
            const formData = new FormData()
            for (const f of files) formData.append('files', f)

            const res = await fetch('/api/upload/images', {
                method: 'POST',
                body: formData,
            })
            const data = await res.json()
            if (!res.ok) {
                throw new Error(data?.error || 'Upload failed')
            }

            const bucket = process.env.NEXT_PUBLIC_S3_BUCKET_NAME
            const base = bucket ? `https://${bucket}.s3.amazonaws.com` : ''

            const alt = files.length === 1 ? (files[0]?.name?.split('.')?.[0] || 'image') : 'image'
            const insert = (url) => `\n\n![${alt}](${url})\n`

            const urls = (data?.files || []).map((key) => base ? `${base}/${key}` : key)
            const addition = urls.map(insert).join('')
            onChange((value || '') + addition)
        } catch (err) {
            console.error('Image upload error:', err)
            alert(err.message || 'Image upload failed')
        } finally {
            setUploading(false)
            // reset input so selecting the same file again still triggers change
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    return (
        <div className={`space-y-2 ${className}`}>
            <label className="block text-sm font-medium text-gray-700">
                {label} {required && <span className="text-red-500">*</span>}
                <span className="text-xs text-gray-500 font-normal ml-2">
                    (Rich Text Editor - Markdown/HTML)
                </span>
            </label>

            <div className="flex items-center justify-between">
                <div className="text-xs text-gray-600">
                    You can use Markdown syntax or HTML tags.
                </div>
                <div className="flex items-center gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleFilesSelected}
                    />
                    <button
                        type="button"
                        onClick={handleUploadClick}
                        disabled={disabled || uploading}
                        className={`px-3 py-1.5 text-xs rounded-md border ${disabled || uploading ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-50'} border-gray-300 text-gray-700`}
                        title="Upload images and insert Markdown image tags"
                    >
                        {uploading ? 'Uploading…' : 'Upload & insert image'}
                    </button>
                </div>
            </div>

            <div className="border border-borderColor rounded-md overflow-hidden">
                <MDEditor
                    value={value || ''}
                    onChange={(val) => onChange(val || '')}
                    height={height}
                    preview="edit"
                    hideToolbar={false}
                    data-color-mode="light"
                    style={{
                        backgroundColor: 'white',
                    }}
                    textareaProps={{
                        placeholder: placeholder || `Enter ${label?.toLowerCase() || 'content'} here... You can use Markdown syntax or HTML tags.`,
                        disabled: disabled,
                        style: {
                            fontSize: '14px',
                            lineHeight: '1.5',
                            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                        }
                    }}
                />
            </div>

            {showHtmlTip && (
                <div className="text-xs text-gray-600 bg-blue-50 p-2 rounded">
                    <strong>Tip:</strong> This editor supports both Markdown and HTML. Use the toolbar for formatting, or write HTML directly for complex layouts.
                </div>
            )}
        </div>
    )
}