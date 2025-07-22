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
    let files = [];
    if (pendingModels.length > 0) {
        const formData = new FormData();
        pendingModels.forEach(file => formData.append('files', file));
        const res = await fetch('/api/upload/models', { method: 'POST', body: formData });
        const data = await res.json();
        files = data.files || [];
    }
    return files;
}

export async function uploadViewable(pendingViewableModel) {
    let file = null;
    if (pendingViewableModel) {
        const formData = new FormData();
        formData.append('file', pendingViewableModel);
        const res = await fetch('/api/upload/viewable', { method: 'POST', body: formData });
        const data = await res.json();
        file = data.file || null;
    }
    return file;
}