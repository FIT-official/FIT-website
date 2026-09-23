'use client';
import React, { Component, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { cameraFit, disposePrintModel, preparePrintModel, stylePrintModel } from '@/lib/modelPresentation';

const VIEW_DIRECTIONS = { isometric: [1, 0.75, 1], front: [0, 0.07, 1], top: [0, 1, 0.0001] };

class PreviewBoundary extends Component {
    state = { error: null };
    static getDerivedStateFromError(error) { return { error }; }
    render() {
        if (this.state.error) return <div role="alert" className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-slate-600">
            The 3D preview could not start. Enable WebGL in your browser or reload this page.
        </div>;
        return this.props.children;
    }
}

function CameraRig({ model, view, resetKey, autoRotate }) {
    const controls = useRef(null);
    const { camera, size, invalidate } = useThree();
    useLayoutEffect(() => {
        const fit = cameraFit(model.radius, size.width / Math.max(size.height, 1), camera.fov);
        const direction = new THREE.Vector3(...(VIEW_DIRECTIONS[view.name] || VIEW_DIRECTIONS.isometric)).normalize();
        camera.up.set(0, 1, 0);
        camera.position.copy(model.center).addScaledVector(direction, fit.distance);
        camera.near = fit.near;
        camera.far = fit.far;
        camera.updateProjectionMatrix();
        camera.lookAt(model.center);
        if (controls.current) {
            controls.current.target.copy(model.center);
            controls.current.minDistance = fit.minDistance;
            controls.current.maxDistance = fit.maxDistance;
            controls.current.update();
        }
        invalidate();
    }, [model, camera, size.width, size.height, view, resetKey, invalidate]);
    return <OrbitControls ref={controls} makeDefault autoRotate={autoRotate} autoRotateSpeed={0.8}
        enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI * 0.49} />;
}

function StudioScene({ model, view, resetKey, autoRotate, intensity, background, onReady }) {
    const { gl } = useThree();
    useEffect(() => {
        onReady?.({ dimensionsMm: model.dimensionsMm });
        const lost = event => event.preventDefault();
        gl.domElement.addEventListener('webglcontextlost', lost);
        return () => gl.domElement.removeEventListener('webglcontextlost', lost);
    }, [gl, model, onReady]);
    const radius = Math.max(model.radius, 0.01);
    const light = Number.isFinite(intensity) ? Math.max(0.25, intensity) : 1;
    const shadowExtent = radius * 1.6;
    return <>
        <color attach="background" args={[background]} />
        <hemisphereLight args={['#f5f7ff', '#b7ae9d', 1.65 * light]} />
        <directionalLight position={[radius * 1.5, radius * 2.5, radius * 1.7]} intensity={3.1 * light}
            color="#fff5e8" castShadow shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-shadowExtent} shadow-camera-right={shadowExtent}
            shadow-camera-top={shadowExtent} shadow-camera-bottom={-shadowExtent}
            shadow-camera-near={radius * 0.05} shadow-camera-far={radius * 9}
            shadow-normalBias={radius * 0.003} shadow-bias={-0.00008}
            onUpdate={lightObject => lightObject.shadow.camera.updateProjectionMatrix()} />
        <directionalLight position={[-radius * 2, radius, -radius]} intensity={1.2 * light} color="#e5edff" />
        <directionalLight position={[0, radius * 2, -radius * 2]} intensity={1.6 * light} color="#ffffff" />
        <primitive object={model.root} dispose={null} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -radius * 0.002, 0]} receiveShadow>
            <planeGeometry args={[radius * 200, radius * 200]} />
            <meshStandardMaterial color={background} roughness={1} metalness={0} />
        </mesh>
        <CameraRig model={model} view={view} resetKey={resetKey} autoRotate={autoRotate} />
    </>;
}

export default function PrintStudio({ scene, fileName = '', upAxis = 'auto', meshColors = {},
    layerHeight = 0.2, showLayers = true, materialType = 'plastic', wireframe = false,
    modelScale = 1, rotationX = 0, rotationY = 0, rotationZ = 0,
    autoRotate = false, intensity = 1, background = '#f4f3ef', resetKey,
    showControls = true, loading = false, error = null, onReady }) {
    const [view, setView] = useState({ name: 'isometric', revision: 0 });
    const [layersEnabled, setLayersEnabled] = useState(showLayers);
    useEffect(() => setLayersEnabled(showLayers), [showLayers]);
    const prepared = useMemo(() => {
        if (!scene) return {};
        try { return { model: preparePrintModel(scene, { fileName, upAxis, modelScale, rotationX, rotationY, rotationZ }) }; }
        catch (failure) { return { error: failure.message }; }
    }, [scene, fileName, upAxis, modelScale, rotationX, rotationY, rotationZ]);
    const model = prepared.model;
    useLayoutEffect(() => {
        if (model) stylePrintModel(model.root, { meshColors, layerHeight, showLayers: layersEnabled, materialType, wireframe });
    }, [model, meshColors, layerHeight, layersEnabled, materialType, wireframe]);
    useEffect(() => () => { if (model) disposePrintModel(model.root); }, [model]);
    const issue = error || prepared.error;
    const chooseView = name => setView(current => ({ name, revision: current.revision + 1 }));
    const dimensions = model?.dimensionsMm;
    return <div className="relative h-full min-h-[320px] w-full overflow-hidden rounded-2xl" style={{ background }} data-testid="print-studio">
        {issue ? <div role="alert" className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-slate-600">{issue}</div>
            : !model ? <div role="status" className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-slate-500">
                {loading ? 'Loading model…' : 'Upload a model to preview your printed part.'}
            </div> : <PreviewBoundary key={scene.uuid}>
                <Canvas shadows dpr={[1, 2]} camera={{ fov: 38, position: [100, 80, 100] }}
                    gl={{ antialias: true, preserveDrawingBuffer: true, toneMapping: THREE.ACESFilmicToneMapping }}
                    fallback={<div role="alert">Your browser does not support the 3D preview.</div>}>
                    <StudioScene model={model} view={view} resetKey={resetKey} autoRotate={autoRotate}
                        intensity={intensity} background={background} onReady={onReady} />
                </Canvas>
            </PreviewBoundary>}
        {model && !issue && <>
            {showControls && <div className="absolute left-4 top-4 flex flex-wrap gap-1 rounded-xl border border-black/10 bg-white/90 p-1 shadow-sm" aria-label="Model view controls">
                {[['isometric', '3D'], ['front', 'Front'], ['top', 'Top']].map(([name, label]) => <button key={name} type="button"
                    aria-pressed={view.name === name} onClick={() => chooseView(name)}
                    className={`rounded-lg px-3 py-2 text-xs font-medium ${view.name === name ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{label}</button>)}
                <button type="button" onClick={() => chooseView('isometric')} className="rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-slate-100">Reset view</button>
                {materialType !== 'resin' && <button type="button" aria-pressed={layersEnabled} onClick={() => setLayersEnabled(value => !value)}
                    className={`rounded-lg px-3 py-2 text-xs ${layersEnabled ? 'bg-slate-100 text-slate-800' : 'text-slate-500'}`}>Layer texture</button>}
            </div>}
            <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex flex-wrap items-end justify-between gap-2 text-[11px] text-slate-500">
                <div className="rounded-lg bg-white/80 px-3 py-2"><span className="font-medium text-slate-600">
                    {[dimensions.width, dimensions.depth, dimensions.height].map(value => value.toLocaleString(undefined, { maximumFractionDigits: 1 })).join(' × ')} mm
                </span><span className="ml-2">W × D × H</span></div>
                <div className="rounded-lg bg-white/80 px-3 py-2">{layersEnabled && materialType !== 'resin'
                    ? `${layerHeight} mm layer shading · approximate, not a toolpath` : 'Drag to orbit · scroll to zoom'}</div>
            </div>
        </>}
    </div>;
}
