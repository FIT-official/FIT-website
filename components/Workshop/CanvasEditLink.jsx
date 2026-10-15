'use client'
export default function CanvasEditLink({ group, idea, seat }) {
    return <a href={'#group-canvas-idea' + idea} className="formWhiteButton" aria-label={'Edit image for Idea ' + idea} style={{ position: 'absolute', right: 12, top: 12, minHeight: 44, background: 'white' }} onClick={event => { event.preventDefault(); window.dispatchEvent(new CustomEvent('fit:edit-image', { detail: { group, idea, seat } })); const editor = document.getElementById('group-canvas-idea' + idea); editor?.scrollIntoView({ block: 'start' }); editor?.querySelector('[data-testid="drawing-board"]')?.focus({ preventScroll: true }) }}>✎ Edit image</a>
}
