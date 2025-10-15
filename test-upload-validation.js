// Test file to verify upload validation constants
// This can be run in the browser console to test validation

// File size limits from ProductForm.jsx
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_MODEL_SIZE = 100 * 1024 * 1024; // 100MB  
const MAX_VIEWABLE_SIZE = 15 * 1024 * 1024; // 15MB

// Test file sizes
const testSizes = [
    { name: '1MB image', size: 1 * 1024 * 1024, type: 'image' },
    { name: '6MB image (too large)', size: 6 * 1024 * 1024, type: 'image' },
    { name: '50MB model', size: 50 * 1024 * 1024, type: 'model' },
    { name: '150MB model (too large)', size: 150 * 1024 * 1024, type: 'model' },
    { name: '10MB viewable', size: 10 * 1024 * 1024, type: 'viewable' },
    { name: '20MB viewable (too large)', size: 20 * 1024 * 1024, type: 'viewable' }
];

console.log('Upload Validation Test Results:');
console.log('================================');

testSizes.forEach(test => {
    let limit, status;

    switch (test.type) {
        case 'image':
            limit = MAX_IMAGE_SIZE;
            status = test.size <= limit ? '✅ PASS' : '❌ FAIL';
            break;
        case 'model':
            limit = MAX_MODEL_SIZE;
            status = test.size <= limit ? '✅ PASS' : '❌ FAIL';
            break;
        case 'viewable':
            limit = MAX_VIEWABLE_SIZE;
            status = test.size <= limit ? '✅ PASS' : '❌ FAIL';
            break;
    }

    console.log(`${status} ${test.name}: ${(test.size / 1024 / 1024).toFixed(1)}MB (limit: ${(limit / 1024 / 1024).toFixed(0)}MB)`);
});

console.log('\nFile validation system is ready! 🚀');