'use client'
import { useId } from 'react'
import { resolveCanvasReference } from '@/lib/workshopPublication'
import { canvasImageUrl } from '@/lib/workshopCanvasImageRef'
export function CanvasReference({ document }) {
    const imported = canvasImageUrl(document.image)
    if (imported) return <image href={imported} x="0" y="0" width="1600" height="1000" preserveAspectRatio="xMidYMid meet" pointerEvents="none" aria-label="Uploaded design image" />
    const asset = resolveCanvasReference(document.reference)
    return asset ? <image href={asset.src} x="0" y="0" width="1600" height="1000" preserveAspectRatio="xMidYMid meet" pointerEvents="none" aria-label="Fixed illustration reference" /> : null
}
export function CanvasObjects({ document }) {
    const marker = 'arrow-' + useId().replaceAll(':', '')
    return <><defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>{document.objects.map(o => {
        const props = { 'data-object-id': o.id, stroke: o.colour, fill: o.fill, strokeWidth: o.size, opacity: o.opacity, strokeLinecap: 'round', strokeLinejoin: 'round', strokeDasharray: o.lineStyle === 'dotted' ? '1 ' + Math.max(4, o.size * 2.5) : undefined, style: { pointerEvents: 'all' } }
        if (o.type === 'stroke') return <path key={o.id} {...props} d={o.points.map((p, i) => (i ? 'L' : 'M') + (o.x + p[0] * o.w) + ',' + (o.y + p[1] * o.h)).join(' ') + (o.points.length === 1 ? ' l .1 .1' : '')} />
        if (o.type === 'rect') return <rect key={o.id} {...props} x={o.x} y={o.y} width={o.w} height={o.h} rx="8" />
        if (o.type === 'ellipse') return <ellipse key={o.id} {...props} cx={o.x + o.w / 2} cy={o.y + o.h / 2} rx={o.w / 2} ry={o.h / 2} />
        if (o.type === 'text') return <svg key={o.id} x={o.x} y={o.y} width={o.w} height={o.h} viewBox={'0 0 ' + o.w + ' ' + o.h} overflow="hidden"><text {...props} x="2" y={o.fontSize} fill={o.colour} stroke="none" fontSize={o.fontSize} fontFamily="system-ui, sans-serif">{o.text.split('\n').map((line, i) => <tspan key={i} x="2" dy={i ? o.fontSize * 1.25 : 0}>{line}</tspan>)}</text></svg>
        const start = [o.x, o.y + (o.reverse ? o.h : 0)], end = [o.x + o.w, o.y + (o.reverse ? 0 : o.h)], a = o.backward ? end : start, b = o.backward ? start : end
        return <line key={o.id} {...props} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} markerEnd={o.type === 'arrow' ? 'url(#' + marker + ')' : undefined} />
    })}</>
}
export default function CanvasDrawing({ document, label = 'Drawing preview' }) { return <svg viewBox="0 0 1600 1000" role="img" aria-label={label} style={{ width: '100%', background: 'white', border: '1px solid #cbd5e1', borderRadius: 16 }}><CanvasReference document={document} /><CanvasObjects document={document} /></svg> }
