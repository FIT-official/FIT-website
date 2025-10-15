import { useDropzone, FileRejection } from 'react-dropzone'

const FileDrop = ({ onDrop }) => {
  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: {
      'model/gltf-binary': ['.glb'],
      'model/gltf+json': ['.gltf'],
      'model/obj': ['.obj'],
      'model/stl': ['.stl'],
      'model/3mf': ['.3mf']
    }
  })

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center text-center" {...getRootProps()}>
      <input {...getInputProps()} />

      {isDragActive ? (
        <p className="flex w-screen h-full items-center justify-center">Drop the files here...</p>
      ) : (
        <p className="flex w-screen h-full cursor-pointer justify-center items-center">
          Drag and drop your 3D file here (GLB, GLTF, OBJ, STL, 3MF)
        </p>
      )}
      {fileRejections.length ? (
        <p className="block text-center text-xl pt-4 text-red-300">Only .gltf, .glb, .obj, .stl, and .3mf files are accepted</p>
      ) : null}
    </div>
  )
}

export default FileDrop
