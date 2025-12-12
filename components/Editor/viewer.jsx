import React, { Suspense, useLayoutEffect, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Stage, Environment } from '@react-three/drei'
import * as THREE from 'three'
import useStore from '@/utils/store'

const SceneStyler = ({
  wireframe,
  background,
  materialType,
  roughness,
  metalness,
  meshColors = {},
}) => {
  const glScene = useThree((state) => state.scene)
  const modelScene = useStore((store) => store.scene) || null

  useLayoutEffect(() => {
    if (!glScene) return
    glScene.background = background ? new THREE.Color(background) : null
  }, [background, glScene])

  useLayoutEffect(() => {
    if (!modelScene) return
    const setMaterialProps = (mat) => {
      switch (materialType) {
        case 'plastic':
          mat.roughness = 0.3
          mat.metalness = 0.0
          break
        case 'resin':
          mat.roughness = 0.05
          mat.metalness = 0.0
          break
        case 'metal':
          mat.roughness = 0.1
          mat.metalness = 0.7
          break
        case 'sandstone':
          mat.roughness = 1.0
          mat.metalness = 0.0
          break
        default:
          mat.roughness = roughness || 0.5
          mat.metalness = metalness || 0.1
      }
    }

    const updateMeshProperties = (mesh) => {
      mesh.castShadow = mesh.receiveShadow = true
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat) => {
            const meshColor = meshColors[mesh.name]
            if (meshColor) {
              mat.color.set(meshColor)
            }
            mat.wireframe = !!wireframe
            if (mat instanceof THREE.MeshStandardMaterial) {
              setMaterialProps(mat)
              mat.needsUpdate = true
            }
          })
        } else {
          const meshColor = meshColors[mesh.name]
          if (meshColor && 'color' in mesh.material && mesh.material.color instanceof THREE.Color) {
            mesh.material.color.set(meshColor)
          }
          mesh.material.wireframe = !!wireframe
          if (mesh.material instanceof THREE.MeshStandardMaterial) {
            setMaterialProps(mesh.material)
            mesh.material.needsUpdate = true
          }
        }
      }
    }

    modelScene.traverse((obj) => {
      if (obj.isMesh) {
        updateMeshProperties(obj)
      }
    })
  }, [modelScene, wireframe, materialType, roughness, metalness, meshColors])

  return null
}


const Viewer = ({
  autoRotate = false,
  environment,
  preset = 'rembrandt',
  intensity = 0,
  wireframe,
  background,
  modelScale = 1,
  rotationX = 0,
  rotationY = 0,
  rotationZ = 0,
  materialType = 'plastic',
  roughness = 0.5,
  metalness = 0.1,
  meshColors = {},
}) => {
  const scene = useStore((store) => store.scene) || null
  const ref = useRef(null)

  useLayoutEffect(() => {
    if (scene) {
      scene.scale.set(modelScale, modelScale, modelScale)
      scene.rotation.set(
        THREE.MathUtils.degToRad(rotationX),
        THREE.MathUtils.degToRad(rotationY),
        THREE.MathUtils.degToRad(rotationZ)
      )
    }
  }, [scene, modelScale, rotationX, rotationY, rotationZ])

  return (
    <Canvas
      gl={{ preserveDrawingBuffer: true }}
      shadows
      dpr={[1, 1.5]}
      camera={{ position: new THREE.Vector3(0, 0, 150), fov: 50 }}
    >
      <ambientLight intensity={0.2} />
      <directionalLight position={[10, 10, 5]} intensity={0.5} />
      <Suspense fallback={null}>
        {scene && (
          <>
            <Environment key={environment} preset={environment || 'city'} background={false} />
            <Stage
              preset={preset}
              intensity={intensity}
              shadows={true}
              adjustCamera
              environment={null}
            >
              <>
                <primitive object={scene} />
              </>
            </Stage>
          </>
        )}
        <SceneStyler
          wireframe={wireframe}
          background={background}
          materialType={materialType}
          roughness={roughness}
          metalness={metalness}
          meshColors={meshColors}
        />
      </Suspense>
      <OrbitControls ref={ref} autoRotate={autoRotate} />
    </Canvas>
  )
}

export default Viewer
