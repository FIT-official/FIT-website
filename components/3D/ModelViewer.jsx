'use client';
import React, { useEffect, useState } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import PrintStudio from './PrintStudio';

export default function ModelViewer({ url, fileName, ...props }) {
    const [state, setState] = useState({ scene: null, loading: Boolean(url), error: null });
    useEffect(() => {
        if (!url) { setState({ scene: null, loading: false, error: null }); return; }
        let cancelled = false;
        setState({ scene: null, loading: true, error: null });
        const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
        loader.load(url, gltf => {
            if (!cancelled) setState({ scene: gltf.scene, loading: false, error: null });
        }, undefined, () => {
            if (!cancelled) setState({ scene: null, loading: false, error: 'The model could not be loaded. Please refresh or try another model.' });
        });
        return () => { cancelled = true; };
    }, [url]);
    return <PrintStudio {...props} {...state} fileName={fileName || 'model.glb'} />;
}
