'use client'
import { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import Link from 'next/link'

export default function FileDrop({ onDrop }) {
  const [error, setError] = useState('')
  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop: files => { setError(''); Promise.resolve(onDrop(files)).catch(err => setError(err.message)) },
    maxSize: 25 * 1024 * 1024,
    accept: { 'model/gltf-binary': ['.glb'], 'model/gltf+json': ['.gltf'], 'model/obj': ['.obj'], 'model/stl': ['.stl'], 'model/3mf': ['.3mf'] },
  })
  return <div className="mx-auto flex min-h-[65vh] max-w-2xl flex-col justify-center gap-5 p-6 text-center">
    <h1>Preview your print</h1>
    <p className="text-sm text-lightColor">Explore your model, choose a finish and see a print estimate.</p>
    <div {...getRootProps()} className="cursor-pointer rounded-2xl border border-dashed border-borderColor bg-baseColor px-6 py-16">
      <input {...getInputProps()} />
      <p>{isDragActive ? 'Drop your model here' : 'Choose a model or drop it here'}</p>
      <p className="mt-3 text-xs text-lightColor">STL, OBJ, 3MF, GLB or GLTF · up to 25 MB</p>
    </div>
    {(error || fileRejections.length > 0) && <p role="alert" className="text-sm text-red-700">{error || 'Choose a supported model file under 25 MB.'}</p>}
    <Link href="/prints/request" className="text-sm underline underline-offset-4">Import a design link or start a print request</Link>
  </div>
}
