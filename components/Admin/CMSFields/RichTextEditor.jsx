import dynamic from 'next/dynamic'
import '@uiw/react-md-editor/markdown-editor.css'

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
    return (
        <div className={`space-y-2 ${className}`}>
            <label className="block text-sm font-medium text-gray-700">
                {label} {required && <span className="text-red-500">*</span>}
                <span className="text-xs text-gray-500 font-normal ml-2">
                    (Rich Text Editor - Markdown/HTML)
                </span>
            </label>

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