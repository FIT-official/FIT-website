// User rejected this exact photo and its resized/cropped variants on 8 October 2026.
// Keep original files intact; prevent publication through authored article HTML.
export function omitRejectedPhoto(html) {
    const blocked = /nygh-printed-mechanism/i
    return html
        .replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, figure => blocked.test(figure) ? '' : figure)
        .replace(/<img\b[^>]*>/gi, image => blocked.test(image) ? '' : image)
}
