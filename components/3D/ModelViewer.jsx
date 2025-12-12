"use client";
import React, { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";

function ModelContent({ url }) {
    const glb = useLoader(GLTFLoader, url);
    return <primitive object={glb.scene} />;
}

export default function ModelViewer({ url }) {
    return (
        <Canvas
            gl={{ preserveDrawingBuffer: true }}
            shadows
            dpr={[1, 1.5]}
            camera={{ position: new THREE.Vector3(0, 0, 150), fov: 50 }}
            className="w-full"
        >
            <ambientLight intensity={0.8} />
            <directionalLight castShadow position={[10, 10, 5]} intensity={1.5} />
            <directionalLight position={[-10, -10, -5]} intensity={0.5} />
            <Suspense fallback={null}>
                <Environment preset="studio" />
                <ModelContent url={url} />
            </Suspense>
            <OrbitControls
                autoRotate
                enablePan={true}
                enableZoom={true}
                enableRotate={true}
            />
        </Canvas>
    );
}