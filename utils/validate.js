export function sanitizeString(str) {
    return String(str).replace(/[<>$]/g, "");
}

export function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

export function checkMagicNumber(buffer, ext) {
    // buffer: Buffer
    // ext: file extension (lowercase, no dot)
    // Returns true if magic number matches expected for ext

    // OBJ, GLTF: text-based, skip magic number check
    if (["obj", "gltf"].includes(ext)) return true;

    // GLB: 67 6C 54 46 ("glTF")
    if (ext === "glb" && buffer.slice(0, 4).toString() === "glTF") return true;

    // STL (binary): 80-byte header, then "STL" may appear, but no strict magic number
    if (ext === "stl") return true; // Can't reliably check, allow

    // BLEND: Blender .blend: 42 4C 45 4E 44 45 52 ("BLENDER")
    if (ext === "blend" && buffer.slice(0, 7).toString() === "BLENDER") return true;

    // FBX: ASCII "Kaydara FBX Binary"
    if (ext === "fbx" && buffer.slice(0, 18).toString() === "Kaydara FBX Binary") return true;

    // ZIP: 50 4B 03 04
    if (ext === "zip" && buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) return true;

    // RAR: 52 61 72 21 1A 07 00
    if (ext === "rar" && buffer.slice(0, 7).equals(Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x00]))) return true;

    // 7z: 37 7A BC AF 27 1C
    if (ext === "7z" && buffer.slice(0, 6).equals(Buffer.from([0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C]))) return true;

    return false;
}
