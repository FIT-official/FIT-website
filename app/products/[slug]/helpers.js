export function getExtension(url) {
    return url.slice(((url.lastIndexOf(".") - 1) >>> 0) + 1).toLowerCase();
}

// export const MODEL_EXTENSIONS = [".glb", ".gltf", ".obj", ".stl", ".fbx"];
// export const ARCHIVE_EXTENSIONS = [".zip", ".rar", ".7z", ".blend"];

export function getGlbModel(models) {
    if (!models || models.length === 0) return null;
    const glbModel = models.find(model => getExtension(model) === "glb");
    return glbModel || models[0];
}