export const threeDPenPhotos = [
    {
        src: '/images/programmes/eeeaa-2026-3d-pen-balloon.jpg',
        width: 1600,
        height: 1200,
        alt: 'A colourful 3D pen hot-air-balloon model on a workshop table, with hands beside it and no faces pictured',
        caption: 'A colourful 3D-pen hot-air-balloon model at the EEEAA 30th Anniversary workshop, 26 September 2026.',
        album: '3D pen / EEEAA, September 2026',
        preserveFrame: true,
    },
    {
        src: '/images/programmes/eeeaa-2026-3d-pen-phone-stand.jpg',
        width: 1600,
        height: 1200,
        alt: 'A blue 3D pen phone-stand model beside a template and hands holding a 3D pen; no faces pictured',
        caption: 'A blue 3D-pen phone-stand model at the EEEAA 30th Anniversary workshop, 26 September 2026.',
        album: '3D pen / EEEAA, September 2026',
        preserveFrame: true,
    },
]

export const miniatureEscapeRoomPhoto = {
    src: '/images/programmes/miniature-escape-room-finished.jpg',
    width: 1280,
    height: 720,
    alt: 'Colourful miniature rooms with sensors, white 3D printed furniture and connected wiring; no faces pictured',
    caption: 'A working miniature escape-room build with sensors, 3D-printed furniture and connected circuits.',
    album: 'FIT miniature escape-room build',
    preserveFrame: true,
}

export const nyghMiniatureRoomPhoto = {
    src: '/images/programmes/nygh-miniature-room-finished.jpg',
    width: 1280,
    height: 720,
    alt: 'A finished miniature room with a blue door and clock from the NYGH project',
    caption: 'A finished miniature room from the NYGH project.',
    album: 'School workshops / NYGH',
    displayZoom: 1.15,
    displayFocus: '0% 0%',
    displayPosition: 'left center',
    displayRatio: '4 / 3',
}

// Presentation crops keep the source photograph unchanged.
export function photoImageStyle({ displayZoom = 1, displayFocus = '50% 50%', displayPosition } = {}) {
    if (displayZoom <= 1 && !displayPosition) return undefined
    return {
        ...(displayZoom > 1 ? { transform: `scale(${displayZoom})`, transformOrigin: displayFocus } : {}),
        ...(displayPosition ? { height: '100%', objectFit: 'cover', objectPosition: displayPosition } : {}),
    }
}
