'use client'
import { useRef, useState } from 'react'
import CanvasDrawing from './CanvasDrawing'
import { resolveCanvasReference } from '@/lib/workshopPublication'
export default function CanvasImageDownload({ document: drawing, group, idea }) {
    const source = useRef(null), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
    async function download() {
        if (busy) return; setBusy(true); setMessage('')
        let imageUrl, downloadUrl
        try {
            // Only our validated SVG elements are rendered. No user-supplied markup or URL is loaded.
            const svg = source.current.querySelector('svg').cloneNode(true); svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); svg.setAttribute('width', '1600'); svg.setAttribute('height', '1000'); svg.removeAttribute('style')
            const reference = resolveCanvasReference(drawing.reference)
            if (reference) {
                const response = await fetch(reference.src, { credentials: 'omit' })
                if (!response.ok) throw Error('Reference unavailable')
                const blob = await response.blob()
                if (blob.size > 4000000 || !blob.type.startsWith('image/')) throw Error('Reference invalid')
                const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob) })
                svg.querySelector('image').setAttribute('href', data)
            }
            imageUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }))
            const image = new Image(); await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(Error('Image export failed')); image.src = imageUrl })
            const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1000; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1600, 1000); ctx.drawImage(image, 0, 0)
            const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); if (!png) throw Error('PNG unavailable')
            downloadUrl = URL.createObjectURL(png); const link = document.createElement('a'); link.href = downloadUrl; link.download = 'FIT-drawing-' + group + '-idea' + idea + '.png'; link.click(); setMessage('Image downloaded to this device. Nothing was uploaded.')
        } catch { setMessage('Image export is unavailable. Download the device copy or ask your teacher for help.') }
        finally { if (imageUrl) URL.revokeObjectURL(imageUrl); if (downloadUrl) setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000); setBusy(false) }
    }
    return <div><button type="button" disabled={busy} onClick={download}>Download image</button>{message && <p role="status">{message}</p>}<div ref={source} hidden><CanvasDrawing document={drawing} /></div></div>
}
