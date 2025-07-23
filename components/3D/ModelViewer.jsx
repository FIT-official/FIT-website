"use client";
import React, { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stage } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";

function ModelContent({ url }) {
    const glb = useLoader(GLTFLoader, url);
    return <primitive object={glb.scene} />
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
            <ambientLight intensity={0.25} />
            <directionalLight castShadow position={[5, 5, 5]} intensity={1} />
            {/* <Perf position="top-left" /> */}
            <Suspense fallback={null}>
                <Stage
                    intensity={0}
                    shadows={true}
                    adjustCamera
                    environment="sunset"
                    preset="rembrandt"
                >
                    <ModelContent url={url} />
                </Stage>
            </Suspense>
            <OrbitControls autoRotate />
        </Canvas>
    );
}