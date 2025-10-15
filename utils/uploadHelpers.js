function getMimeType(ext) {
    const mimeTypes = {
        obj: "application/octet-stream",
        glb: "model/gltf-binary",
        gltf: "model/gltf+json",
        stl: "model/stl",
        blend: "application/octet-stream",
        fbx: "application/octet-stream",
        zip: "application/zip",
        rar: "application/x-rar-compressed",
        "7z": "application/x-7z-compressed"
    };
    return mimeTypes[ext] || "application/octet-stream";
}

export async function uploadImages(pendingImages) {
    let files = [];
    if (pendingImages.length > 0) {
        const formData = new FormData();
        pendingImages.forEach(file => formData.append('files', file));
        const res = await fetch('/api/upload/images', { method: 'POST', body: formData });
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Image upload failed');
        }

        files = data.files || [];
    }
    return files;
}

export async function uploadModels(pendingModels) {
    const ALLOWED_MODEL_EXTS = [
        "obj", "glb", "gltf", "stl", "blend", "fbx", "zip", "rar", "7z"
    ];
    const MAX_SIZE = 100 * 1024 * 1024; // 100MB
    const uploadedKeys = [];

    for (const model of pendingModels) {
        const name = model.name || `model_${Date.now()}.${(model.type ? model.type.split('/').pop() : 'bin')}`;
        const ext = name.split('.').pop().toLowerCase();

        if (!ALLOWED_MODEL_EXTS.includes(ext)) {
            throw new Error(`Unsupported file type: ${ext} for file "${name}". Allowed types: ${ALLOWED_MODEL_EXTS.join(', ')}`);
        }
        if (model.size > MAX_SIZE) {
            const sizeMB = (model.size / (1024 * 1024)).toFixed(1);
            throw new Error(`File "${name}" is too large (${sizeMB}MB). Maximum size is 100MB.`);
        }
        const contentType = model.type || getMimeType(ext);

        try {
            const res = await fetch("/api/upload/models", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: name, contentType }),
            });
            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`Failed to get signed URL for "${name}": ${errorText}`);
            }
            const { url, key } = await res.json();

            const uploadRes = await fetch(url, {
                method: "PUT",
                headers: { "Content-Type": contentType },
                body: model,
            });
            if (uploadRes.ok && key) {
                uploadedKeys.push(key);
            } else {
                const errorText = await uploadRes.text();
                throw new Error(`Failed to upload model "${name}" to S3: ${errorText}`);
            }
        } catch (error) {
            console.error(`Failed to upload model ${name}:`, error);
            throw error; // Re-throw to be handled by ProductForm
        }
    }
    return uploadedKeys;
}

export async function uploadViewable(pendingViewableModel) {
    const MAX_SIZE = 15 * 1024 * 1024; // 15MB
    const ALLOWED_MODEL_EXTS = [
        "glb", "gltf"
    ];

    if (pendingViewableModel) {
        const name = pendingViewableModel.name || `viewable_${Date.now()}.${(pendingViewableModel.type ? pendingViewableModel.type.split('/').pop() : 'glb')}`;
        const ext = name.split('.').pop().toLowerCase();

        if (!ALLOWED_MODEL_EXTS.includes(ext)) {
            throw new Error(`Unsupported viewable model file type: ${ext} for file "${name}". Allowed types: ${ALLOWED_MODEL_EXTS.join(', ')}`);
        }
        if (pendingViewableModel.size > MAX_SIZE) {
            const sizeMB = (pendingViewableModel.size / (1024 * 1024)).toFixed(1);
            throw new Error(`Viewable model "${name}" is too large (${sizeMB}MB). Maximum size is 15MB.`);
        }
        const contentType = pendingViewableModel.type || getMimeType(ext);

        try {
            const res = await fetch("/api/upload/viewable", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: name, contentType }),
            });
            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`Failed to get signed URL for viewable model "${name}": ${errorText}`);
            }
            const { url, key } = await res.json();
            const uploadRes = await fetch(url, {
                method: "PUT",
                headers: { "Content-Type": contentType },
                body: pendingViewableModel,
            });
            if (uploadRes.ok && key) {
                return key;
            } else {
                const errorText = await uploadRes.text();
                throw new Error(`Failed to upload viewable model "${name}" to S3: ${errorText}`);
            }
        } catch (error) {
            console.error(`Failed to upload viewable model ${name}:`, error);
            throw error; // Re-throw to be handled by ProductForm
        }
    }
    return null;
}

// export async function uploadViewable(pendingViewableModel) {
//     let file = null;
//     if (pendingViewableModel) {
//         const formData = new FormData();
//         formData.append('file', pendingViewableModel);
//         const res = await fetch('/api/upload/viewable', { method: 'POST', body: formData });
//         const data = await res.json();
//         file = data.file || null;
//     }
//     return file;
// }

// export async function uploadModels(pendingModels) {
//     let files = [];
//     if (pendingModels.length > 0) {
//         const formData = new FormData();
//         pendingModels.forEach(file => formData.append('files', file));
//         const res = await fetch('/api/upload/models', { method: 'POST', body: formData });
//         const data = await res.json();
//         files = data.files || [];
//     }
//     return files;
// }