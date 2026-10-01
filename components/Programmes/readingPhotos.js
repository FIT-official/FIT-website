import { miniatureEscapeRoomPhoto } from './finishedProjectPhotos'
import { escapeRoomPhotos } from './workshopPhotos'

// Curated per article. Keep unknown topics text-only instead of borrowing an
// unrelated project photo. All source files are already published FIT assets.
const printing = {
    src: '/printer.png', width: 1024, height: 1024,
    alt: '3D printers and replacement parts from the FIT catalogue',
    displayPosition: 'center',
}
const design = {
    ...miniatureEscapeRoomPhoto,
    alt: 'A finished white 3D-printed miniature table and chairs in the FIT escape-room project',
    displayZoom: 5,
    displayFocus: '50% 77%',
    displayPosition: 'center',
}
const materials = {
    src: '/filament.png', width: 810, height: 736,
    alt: 'Different coloured filament spools in the FIT catalogue',
    displayPosition: 'center',
}
const electronics = escapeRoomPhotos.find(photo => photo.src.endsWith('/escape-room-button-lights.jpg'))

const photos = {
    '/blog/3d-printing': printing,
    '/blog/tinkercad-toolbox-guide': design,
    '/blog/fusion-360-cup-holder-workshop-guide': design,
    '/blog/3d-printing-theory-and-material-properties': materials,
    '/blog/3d-printing-filament-types-guide': materials,
    '/blog/arduino-nano-io-expansion-shield-wiring': electronics,
    '/blog/arduino-nano-dht11-workshop-guide': electronics,
}

export function readingPhotoFor(href) {
    return Object.hasOwn(photos, href) ? photos[href] : undefined
}
