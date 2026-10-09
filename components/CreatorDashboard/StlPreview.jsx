'use client';
import { useEffect, useRef, useState } from 'react';
export default function StlPreview({ file }) {
    const host = useRef(null), [error, setError] = useState('');
    useEffect(() => {
        if (!file || !host.current) return;
        let cancelled = false, renderer, geometry, material;
        async function draw() {
            const THREE = await import('three');
            const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
            const bytes = await file.arrayBuffer(); if (cancelled) return;
            geometry = new STLLoader().parse(bytes); geometry.center(); geometry.computeBoundingSphere();
            const scene = new THREE.Scene(); scene.background = new THREE.Color('#f0f5f1');
            const radius = Math.max(geometry.boundingSphere.radius, 1);
            const camera = new THREE.PerspectiveCamera(40, 2, radius / 100, radius * 20);
            camera.position.set(radius * 2.5, radius * 1.8, radius * 2.5); camera.lookAt(0, 0, 0);
            material = new THREE.MeshStandardMaterial({ color: '#358c66', roughness: 0.6 });
            const mesh = new THREE.Mesh(geometry, material); mesh.rotation.x = -Math.PI / 2; scene.add(mesh);
            scene.add(new THREE.AmbientLight(0xffffff, 1.7));
            const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(2, 4, 3); scene.add(light);
            renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(600, 300); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = 'auto';
            host.current.replaceChildren(renderer.domElement); renderer.render(scene, camera);
        }
        draw().catch(() => { if (!cancelled) setError('3D preview unavailable. Use the geometry measurements below.'); });
        return () => { cancelled = true; renderer?.dispose(); geometry?.dispose(); material?.dispose(); };
    }, [file]);
    return <div><div ref={host} aria-label="STL model preview" />{error && <p className="cd-muted">{error}</p>}</div>;
}
