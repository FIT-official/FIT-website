export async function uploadImages(pendingImages) {
    let files = [];
    if (pendingImages.length > 0) {
        const formData = new FormData();
        pendingImages.forEach(file => formData.append('files', file));
        const res = await fetch('/api/upload/images', { method: 'POST', body: formData });
        const data = await res.json();
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
        const ext = model.name.split('.').pop().toLowerCase();
        if (!ALLOWED_MODEL_EXTS.includes(ext)) {
            throw new Error(`Unsupported file type: ${ext}`);
        }
        if (model.size > MAX_SIZE) {
            throw new Error(`File size exceeds limit: ${model.size} bytes`);
        }
        try {
            const res = await fetch("/api/upload/models", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: model.name, contentType: model.type }),
            });
            const { url, key } = await res.json();

            await fetch(url, {
                method: "PUT",
                headers: { "Content-Type": model.type },
                body: model,
            });
            uploadedKeys.push(key);
        } catch (error) {
            console.error(`Failed to upload model ${model.name}:`, error);
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
        const ext = pendingViewableModel.name.split('.').pop().toLowerCase();
        if (!ALLOWED_MODEL_EXTS.includes(ext)) {
            throw new Error(`Unsupported file type: ${ext}`);
        }
        if (pendingViewableModel.size > MAX_SIZE) {
            throw new Error(`File size exceeds limit: ${pendingViewableModel.size} bytes`);
        }
        try {
            const res = await fetch("/api/upload/viewable", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: pendingViewableModel.name, contentType: pendingViewableModel.type }),
            });
            const { url, key } = await res.json();
            await fetch(url, {
                method: "PUT",
                headers: { "Content-Type": pendingViewableModel.type },
                body: pendingViewableModel,
            });
            return key;
        } catch (error) {
            console.error(`Failed to upload viewable model ${pendingViewableModel.name}:`, error);
        }
    };
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