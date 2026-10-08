'use client'
import { useRef, useState } from 'react'

export default function CopyField({ label, id, value, privateValue = false }) {
    const input = useRef(null), [message, setMessage] = useState(''), [copying, setCopying] = useState(false)
    async function copy() {
        if (copying) return
        setCopying(true); setMessage('')
        try {
            if (!navigator.clipboard?.writeText) throw Error('Clipboard unavailable')
            await navigator.clipboard.writeText(value)
            setMessage(label + ' copied.')
        } catch {
            input.current?.focus(); input.current?.select()
            setMessage('Text selected. Use your device’s Copy command.')
        } finally { setCopying(false) }
    }
    return <div className={'mt-5' + (privateValue ? ' ph-mask ph-no-capture' : '')}>
        <label className="block font-semibold" htmlFor={id}>{label}</label>
        <div className="flex flex-wrap gap-2 mt-2"><input ref={input} id={id} className="formInput min-w-0 flex-1 font-mono" readOnly autoComplete="off" spellCheck={false} value={value} /><button type="button" className="formWhiteButton" disabled={copying} aria-label={'Copy ' + label.toLowerCase()} onClick={copy}>Copy</button></div>
        {message && <p role="status" aria-live="polite" className="text-sm mt-1">{message}</p>}
    </div>
}
