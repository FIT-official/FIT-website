import * as THREE from 'three';

export function modelConvention(fileName = '', upAxis = 'auto') {
    const extension = String(fileName).split(/[?#]/)[0].split('.').pop().toLowerCase();
    return {
        millimetresPerUnit: ['gltf', 'glb'].includes(extension) ? 1000 : 1,
        upAxis: ['y', 'z'].includes(upAxis) ? upAxis : ['stl', '3mf'].includes(extension) ? 'z' : 'y',
    };
}

export function filamentSurface(materialType = 'plastic') {
    const material = materialType.toLowerCase();
    if (material === 'resin') return { roughness: 0.5, metalness: 0 };
    if (['sandstone', 'wood'].includes(material)) return { roughness: 0.9, metalness: 0 };
    if (material === 'metal') return { roughness: 0.53, metalness: 0.15 };
    return { roughness: 0.72, metalness: 0 };
}

export function createPrintedMaterial({ color = '#c7c9c6', materialType, wireframe = false,
    layerHeight = 0.2, showLayers = true } = {}) {
    const material = new THREE.MeshStandardMaterial({ color, ...filamentSurface(materialType),
        wireframe, side: THREE.DoubleSide });
    // A subtle, anti-aliased shading approximation at the chosen millimetre
    // pitch. It is not sliced geometry, a toolpath or a printability prediction.
    const pitch = Number.isFinite(layerHeight) && layerHeight > 0 ? layerHeight : 0.2;
    if (showLayers && materialType !== 'resin') {
        material.onBeforeCompile = shader => {
            shader.uniforms.fitLayerHeight = { value: pitch };
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', '#include <common>\nvarying vec3 fitWorldPosition;')
                .replace('#include <project_vertex>', '#include <project_vertex>\nfitWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', '#include <common>\nvarying vec3 fitWorldPosition;\nuniform float fitLayerHeight;')
                .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
                    float fitPhase = fitWorldPosition.y / fitLayerHeight;
                    float fitVisible = 1.0 - smoothstep(0.28, 0.7, fwidth(fitPhase));
                    vec3 fitWorldNormal = inverseTransformDirection(normal, viewMatrix);
                    float fitSide = 1.0 - pow(abs(fitWorldNormal.y), 3.0);
                    float fitGroove = 0.5 + 0.5 * cos(fitPhase * 6.2831853);
                    diffuseColor.rgb *= 1.0 - 0.085 * fitGroove * fitVisible * fitSide;
                    roughnessFactor = min(1.0, roughnessFactor + 0.07 * fitGroove * fitVisible * fitSide);
                `);
        };
        material.customProgramCacheKey = () => `fit-filament-layers-${pitch}`;
    }
    return material;
}

export function preparePrintModel(source, { fileName = '', upAxis = 'auto', modelScale = 1,
    rotationX = 0, rotationY = 0, rotationZ = 0 } = {}) {
    if (!source?.isObject3D) throw new Error('No model geometry is available.');
    const convention = modelConvention(fileName, upAxis);
    const root = new THREE.Group();
    const orientation = new THREE.Group();
    const model = source.clone(true);
    const removed = [];
    model.traverse(child => {
        if (child.isLight || child.isCamera) removed.push(child);
        if (child.isMesh) {
            const originals = Array.isArray(child.material) ? child.material : [child.material];
            child.userData.fitOriginalColors = originals.map(material => material?.color?.getHexString?.() || 'c7c9c6');
            child.material = originals.map(color => createPrintedMaterial());
            if (!Array.isArray(source.material) && child.material.length === 1) child.material = child.material[0];
            child.castShadow = child.receiveShadow = true;
        }
    });
    removed.forEach(child => child.removeFromParent());
    const scale = Number.isFinite(modelScale) && modelScale > 0 ? modelScale : 1;
    orientation.scale.setScalar(convention.millimetresPerUnit * scale);
    if (convention.upAxis === 'z') orientation.rotation.x = -Math.PI / 2;
    orientation.add(model);
    root.add(orientation);
    root.rotation.set(...[rotationX, rotationY, rotationZ].map(value => THREE.MathUtils.degToRad(Number.isFinite(value) ? value : 0)));
    root.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(root, true);
    const size = bounds.getSize(new THREE.Vector3());
    if (bounds.isEmpty() || ![size.x, size.y, size.z].every(Number.isFinite) || size.length() <= 0) {
        disposePrintModel(root);
        throw new Error('This file does not contain visible 3D geometry.');
    }
    const center = bounds.getCenter(new THREE.Vector3());
    root.position.set(-center.x, -bounds.min.y, -center.z);
    root.updateWorldMatrix(true, true);
    return { root, size, center: new THREE.Vector3(0, size.y / 2, 0), radius: size.length() / 2,
        convention, dimensionsMm: { width: size.x, depth: size.z, height: size.y } };
}

export function stylePrintModel(root, { meshColors = {}, ...options } = {}) {
    root.traverse(child => {
        if (!child.isMesh) return;
        const previous = Array.isArray(child.material) ? child.material : [child.material];
        const colors = child.userData.fitOriginalColors || ['c7c9c6'];
        const selected = meshColors[child.name] || meshColors.default;
        const materials = colors.map(color => createPrintedMaterial({ ...options, color: selected || `#${color}` }));
        child.material = materials.length > 1 ? materials : materials[0];
        previous.forEach(material => material?.dispose());
    });
}

export function disposePrintModel(root) {
    // Geometry belongs to the source and may also drive quotes or another view.
    root.traverse(child => {
        if (child.isMesh) (Array.isArray(child.material) ? child.material : [child.material]).forEach(material => material?.dispose());
    });
}

export function cameraFit(radius, aspect = 1, verticalFov = 38) {
    const safeRadius = Math.max(radius, 0.001);
    const halfVertical = THREE.MathUtils.degToRad(verticalFov / 2);
    const halfHorizontal = Math.atan(Math.tan(halfVertical) * Math.max(aspect, 0.1));
    const distance = safeRadius / Math.sin(Math.min(halfVertical, halfHorizontal)) * 1.15;
    return { distance, near: Math.max(safeRadius / 1000, 0.00001), far: distance + safeRadius * 30,
        minDistance: safeRadius * 0.25, maxDistance: distance * 8 };
}
