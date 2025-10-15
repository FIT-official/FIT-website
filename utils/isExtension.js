export const getFileExtension = (file) => file?.split('.').pop()

export const isJson = (file) => file?.split('.').pop() === 'json'

export const isGlb = (file) => file?.split('.').pop() === 'glb'

export const isGltf = (file) => file?.split('.').pop() === 'gltf'

export const isObj = (file) => file?.split('.').pop() === 'obj'

export const isStl = (file) => file?.split('.').pop() === 'stl'

export const is3mf = (file) => file?.split('.').pop() === '3mf'

export const isZip = (file) => file?.split('.').pop() === 'zip'

export const is3DModel = (file) => {
    const ext = file?.split('.').pop()
    return ['glb', 'gltf', 'obj', 'stl', '3mf'].includes(ext)
}
