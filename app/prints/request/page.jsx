"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"

const initialForm = {
  title: "",
  description: "",
  notes: "",
}

export default function CustomPrintRequestPage() {
  const { user, isLoaded } = useUser()
  const router = useRouter()
  const [form, setForm] = useState(initialForm)
  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleFileChange = (e) => {
    const f = e.target.files?.[0]
    setFile(f || null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")

    if (!isLoaded || !user) {
      setError("Please sign in to request a custom print.")
      return
    }
    if (!file) {
      setError("Please upload a 3D model file.")
      return
    }

    try {
      setSubmitting(true)

      const formData = new FormData()
      formData.append("file", file)
      formData.append("title", form.title)
      formData.append("description", form.description)
      formData.append("notes", form.notes)

      const res = await fetch("/api/custom-print", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to create request")
      }

      const data = await res.json()
      const requestId = data?.request?.requestId
      if (requestId) {
        router.push(`/editor?requestId=${encodeURIComponent(requestId)}`)
      } else {
        router.push("/account")
      }
    } catch (err) {
      setError(err.message || "Something went wrong")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-4">Request a Custom Print</h1>
      <p className="text-sm text-gray-500 mb-6">
        Upload your 3D model and details. We&apos;ll review, configure, and send you a quote.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="title">
            Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            value={form.title}
            onChange={handleChange}
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="Short name for this print"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            value={form.description}
            onChange={handleChange}
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="What is this print for? Any key requirements?"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="notes">
            Extra notes (optional)
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            value={form.notes}
            onChange={handleChange}
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="Deadlines, preferred material, colors, or other constraints"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="file">
            3D model file
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".glb,.gltf,.stl,.obj,.3mf,.zip"
            onChange={handleFileChange}
            className="w-full text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            Supported: GLB, GLTF, STL, OBJ, 3MF, or ZIP containing these.
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded bg-black text-white disabled:opacity-60"
        >
          {submitting ? "Submitting..." : "Submit Request"}
        </button>
      </form>
    </div>
  )
}
