// Saved per-part colours key meshes by name. Keep unnamed or duplicate parts
// stable across reloads, and avoid keys Mongo cannot persist safely.
export function normaliseMeshNames(scene) {
    const used = new Set();
    let index = 0;
    scene.traverse(object => {
        if (!object.isMesh) return;
        index++;
        let base = String(object.name || `Part ${index}`).replace(/[.$]/g, '_').slice(0, 130);
        if (['__proto__', 'constructor', 'prototype'].includes(base)) base = `Part ${index}`;
        let name = base;
        let suffix = 2;
        while (used.has(name)) name = `${base} (${suffix++})`;
        object.name = name;
        used.add(name);
    });
}
