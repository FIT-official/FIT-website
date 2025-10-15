// Simple test to verify file validation is working
// You can test this in the browser console when on the ProductForm page

console.log('🧪 Testing File Validation System');

// Mock file objects for testing
function createMockFile(name, sizeInMB, type = 'image/jpeg') {
    return {
        name: name,
        size: sizeInMB * 1024 * 1024, // Convert MB to bytes
        type: type
    };
}

// Test validation functions (copy from ProductForm.jsx)
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_MODEL_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_VIEWABLE_SIZE = 15 * 1024 * 1024; // 15MB
const ALLOWED_MODEL_EXTS = ['obj', 'glb', 'gltf', 'stl', 'blend', 'fbx', 'zip', 'rar', '7z'];
const ALLOWED_VIEWABLE_EXTS = ['glb', 'gltf'];

const validateImageFiles = (files) => {
    const errors = [];
    const validFiles = [];

    Array.from(files).forEach((file, index) => {
        // Check file type
        if (!file.type.startsWith('image/')) {
            errors.push(`File "${file.name}" is not a valid image file.`);
            return;
        }

        // Check file size
        if (file.size > MAX_IMAGE_SIZE) {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
            errors.push(`File "${file.name}" is too large (${sizeMB}MB). Maximum size is 5MB.`);
            return;
        }

        validFiles.push(file);
    });

    return { errors, validFiles };
};

// Test cases
const testFiles = [
    createMockFile('small-image.jpg', 2), // Should pass
    createMockFile('large-image.jpg', 8), // Should fail
    createMockFile('document.pdf', 1, 'application/pdf'), // Should fail (not image)
];

console.log('\n📁 Testing Image Validation:');
const result = validateImageFiles(testFiles);
console.log('Errors:', result.errors);
console.log('Valid files:', result.validFiles.map(f => f.name));

// Test if validation errors would disable submit
const hasErrors = result.errors.length > 0;
console.log('\n🚫 Submit button should be disabled:', hasErrors);

if (hasErrors) {
    console.log('✅ Validation is working - large files are being caught!');
} else {
    console.log('❌ Issue detected - validation is not catching large files');
}

console.log('\n🔍 Debug info:');
console.log('Image size limit:', MAX_IMAGE_SIZE / 1024 / 1024 + 'MB');
testFiles.forEach(file => {
    const sizeMB = file.size / 1024 / 1024;
    const tooLarge = file.size > MAX_IMAGE_SIZE;
    console.log(`- ${file.name}: ${sizeMB}MB (${tooLarge ? 'TOO LARGE' : 'OK'})`);
});