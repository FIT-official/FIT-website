import { create } from 'zustand'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'

// Code generation removed - not needed for 3D model viewer

const useStore = create((set, get) => ({
  fileName: '',
  buffers: null,
  textOriginalFile: '',
  animations: false,
  scene: null,
  orderId: null,
  productId: null,
  variantId: null,
  requestId: null,
  isCustomPrint: false,

  setFileName: (fileName) => set({ fileName, scene: null }),
  setBuffers: (buffers) => set({ buffers, scene: null }),
  setScene: (scene) => set({ scene }),
  setOrderId: (orderId) => set({ orderId }),
  setProductId: (productId) => set({ productId }),
  setVariantId: (variantId) => set({ variantId }),
  setRequestId: (requestId) => set({ requestId }),

  generateScene: async (config) => {
    const { fileName: rawFileName, buffers } = get()
    if (!buffers) return

    const fileName =
      config.pathPrefix && config.pathPrefix !== ''
        ? `${config.pathPrefix}/${rawFileName}`
        : rawFileName

    const fileExtension = fileName.toLowerCase().split('.').pop()
    let result

    // Handle different file formats
    if (['obj', 'stl', '3mf'].includes(fileExtension)) {
      const [key, buffer] = buffers.entries().next().value

      result = await new Promise((resolve, reject) => {
        let loader
        let scene = new THREE.Scene()

        try {
          switch (fileExtension) {
            case 'obj':
              loader = new OBJLoader()
              const objGroup = loader.parse(new TextDecoder().decode(buffer))
              // Ensure all meshes have names and proper materials
              let meshIndex = 0
              objGroup.traverse((child) => {
                if (child.isMesh) {
                  // Give each mesh a consistent, meaningful name
                  child.name = child.name && child.name !== '' ? child.name : `Mesh_${meshIndex++}`

                  // Always replace the material with a proper MeshStandardMaterial for OBJ files
                  child.material = new THREE.MeshStandardMaterial({
                    color: 0xffffff,
                    roughness: 0.3,
                    metalness: 0.0,
                    side: THREE.DoubleSide,
                    transparent: false,
                    opacity: 1.0
                  })

                  child.castShadow = true
                  child.receiveShadow = true
                  console.log('OBJ Mesh found:', child.name, 'Material type:', child.material.type) // Debug log
                }
              })
              scene.add(objGroup)
              resolve({ scene, animations: [] })
              break

            case 'stl':
              loader = new STLLoader()
              const geometry = loader.parse(buffer)
              const material = new THREE.MeshStandardMaterial({ color: 0xffffff })
              const mesh = new THREE.Mesh(geometry, material)
              mesh.name = 'STL_Mesh'
              mesh.castShadow = true
              mesh.receiveShadow = true
              scene.add(mesh)
              resolve({ scene, animations: [] })
              break

            case '3mf':
              loader = new ThreeMFLoader()
              ;(() => {
                let settled = false
                const finish = (object) => {
                  if (settled) return
                  settled = true
                  // Ensure all meshes have names and shadows
                  object.traverse((child) => {
                    if (child.isMesh) {
                      child.name = child.name || `3MF_Mesh_${Math.random().toString(36).substr(2, 9)}`
                      child.castShadow = true
                      child.receiveShadow = true
                    }
                  })
                  scene.add(object)
                  resolve({ scene, animations: [] })
                }
                const fail = (err) => {
                  if (settled) return
                  settled = true
                  reject(err)
                }

                try {
                  // three.js versions differ:
                  // - some expose parse(data) => Group (sync)
                  // - others expose parse(data, onLoad, onError) (async)
                  const maybeObject = loader.parse(buffer, finish, fail)
                  if (maybeObject) finish(maybeObject)
                } catch (e) {
                  fail(e)
                }
              })()
              break

            default:
              reject(new Error(`Unsupported file format: ${fileExtension}`))
          }
        } catch (error) {
          reject(error)
        }
      })
    } else if (['gltf', 'glb'].includes(fileExtension) && buffers.size !== 1) {
      const loadingManager = new THREE.LoadingManager()
      const dracoloader = new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')
      const gltfLoader = new GLTFLoader(loadingManager)
        .setDRACOLoader(dracoloader)
        .setMeshoptDecoder(MeshoptDecoder)
        .setKTX2Loader(new KTX2Loader())

      result = await new Promise((resolve, reject) => {
        const objectURLs = []

        loadingManager.setURLModifier((path) => {
          const entry = [...buffers.entries()].find(([key]) => path.endsWith(key))
          if (!entry) return path

          const [key, buffer] = entry
          const url = URL.createObjectURL(new Blob([buffer]))
          objectURLs.push(url)
          return url
        })

        const gltfBuffer = [...buffers.entries()].find(([key]) =>
          fileName.endsWith(key)
        )?.[1]

        if (!gltfBuffer) {
          reject(new Error('GLTF buffer not found'))
          return
        }

        const basePath = fileName.slice(0, fileName.lastIndexOf('/') + 1)

        gltfLoader.parse(gltfBuffer, basePath, (gltf) => {
          objectURLs.forEach(URL.revokeObjectURL)
          loadingManager.setURLModifier = THREE.DefaultLoadingManager.setURLModifier
          resolve(gltf)
        }, reject)
      })
    } else if (['gltf', 'glb'].includes(fileExtension)) {
      const dracoloader = new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')
      const gltfLoader = new GLTFLoader()
        .setDRACOLoader(dracoloader)
        .setMeshoptDecoder(MeshoptDecoder)
        .setKTX2Loader(new KTX2Loader())

      const [key, buffer] = buffers.entries().next().value
      const basePath = key.includes('/') ? key.slice(0, key.lastIndexOf('/') + 1) : ''
      const isGLB = key.toLowerCase().endsWith('.glb')

      result = await new Promise((resolve, reject) => {
        if (isGLB) {
          gltfLoader.parse(buffer, basePath, resolve, reject)
        } else {
          const textDecoder = new TextDecoder()
          const json = textDecoder.decode(buffer)
          gltfLoader.parse(json, basePath, resolve, reject)
        }
      })
    } else {
      throw new Error(`Unsupported file format: ${fileExtension}`)
    }

    set({
      animations: !!result.animations?.length,
    })

    // Always replace the scene when regenerating from new buffers.
    set({ scene: result.scene })
  },
}))

export default useStore
