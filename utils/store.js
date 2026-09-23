import { create } from 'zustand'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import { computeMetricsFromObject } from '@/lib/quoting/threeGeometryAdapter'
import { threeMfMillimetresPerUnit } from '@/lib/modelUnits'
import { normaliseMeshNames } from '@/lib/modelMeshNames'

// Code generation removed - not needed for 3D model viewer

let loadSequence = 0

const useStore = create((set, get) => ({
  fileName: '',
  buffers: null,
  textOriginalFile: '',
  animations: false,
  scene: null,
  loading: false,
  loadError: null,
  geometryMetrics: null, // { volumeCm3, dimensionsCm, watertight, confidence } from the loaded model
  orderId: null,
  productId: null,
  variantId: null,
  requestId: null,
  isCustomPrint: false,
  returnTo: null, // validated same-origin path to return to after saving
  // Product-print editor mode (productType:"print" bought via "Order Print"):
  // the vendor's fixed config + offered colours, so the editor locks settings
  // and constrains the colour picker. See openspec change
  // `migrate-print-delivery-to-custom-requests`.
  productPrintConfig: null, // product.printConfig (fixed settings) or null
  productColours: null, // [{name,hex}] offered colours, or null
  colourVariantName: null, // the colour-type variant's name (for selectedVariants)

  setFileName: (fileName) => { loadSequence++; set({ fileName, scene: null, geometryMetrics: null, loadError: null, loading: false }) },
  setBuffers: (buffers) => { loadSequence++; set({ buffers, scene: null, geometryMetrics: null, loadError: null, loading: false }) },
  setScene: (scene) => set({ scene }),
  setReturnTo: (returnTo) => set({ returnTo }),
  setOrderId: (orderId) => set({ orderId }),
  setProductId: (productId) => set({ productId }),
  setVariantId: (variantId) => set({ variantId }),
  setRequestId: (requestId) => set({ requestId }),

  generateScene: async (config = {}) => {
    const { fileName: rawFileName, buffers } = get()
    if (!buffers) return
    const requestSequence = ++loadSequence
    set({ loading: true, loadError: null })
    try {

    const fileName =
      config.pathPrefix && config.pathPrefix !== ''
        ? `${config.pathPrefix}/${rawFileName}`
        : rawFileName

    const fileExtension = fileName.toLowerCase().split('.').pop()
    const threeMfScale = fileExtension === '3mf'
      ? await threeMfMillimetresPerUnit(buffers.entries().next().value[1]) : 1
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

    normaliseMeshNames(result.scene)
    if (fileExtension === '3mf') {
      result.scene.scale.multiplyScalar(threeMfScale)
      result.scene.userData.units = 'mm'
    }
    // An earlier, slower parse must not replace the user's newer upload.
    if (requestSequence !== loadSequence) return
    set({ animations: !!result.animations?.length })

    // Always replace the scene when regenerating from new buffers.
    set({ scene: result.scene, loading: false, loadError: null })

    // Compute pricing-ready geometry metrics for the Instant Quoting Engine.
    // Best-effort: never let a measurement error break model loading.
    try {
      const geometryMetrics = computeMetricsFromObject(result.scene, rawFileName)
      set({ geometryMetrics })
    } catch (err) {
      console.error('Failed to compute geometry metrics:', err)
      set({ geometryMetrics: null })
    }
    } catch (error) {
      if (requestSequence === loadSequence) set({ scene: null, geometryMetrics: null, loading: false, loadError: error?.message || 'The model could not be loaded.' })
      throw error
    }
  },
}))

export default useStore
