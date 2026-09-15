"use client"
// Custom print request (/prints/request). Two flows share the page:
//   - Fix It Today (default): upload a model, then configure it in /editor and
//     FIT quotes it (the original behaviour).
//   - ?creator=<userId|displayName>: the request goes to that creator's own
//     print service (GET /api/creators/[id]/print-service). Material and colour
//     are constrained to the creator's list, an indicative estimate of
//     max(minimumCharge, grams x pricePerGram) is shown when the model can be
//     measured in the browser (STL/OBJ), and the request is created with
//     creatorUserId so the creator quotes it from /dashboard/print-jobs.
// Upload path is the same presigned S3 flow the cart uses
// (components/Cart/CustomPrintUpload.jsx): POST /api/custom-print ->
// POST /api/upload/models -> PUT to S3 -> PUT /api/custom-print.
import { Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { getMimeType, putWithProgress } from "@/utils/uploadHelpers"
import { parseStlToPositions } from "@/lib/quoting/stl"
import { parseObjToPositions } from "@/lib/quoting/obj"
import { computeGeometryMetrics } from "@/lib/quoting/geometryVolume"
import { estimateMaterialGrams } from "@/lib/quoting/materialEstimate"
import { estimateCreatorPrintPrice } from "@/lib/creatorPrintService/estimate"

const FIT_ACCEPT = ".glb,.gltf,.stl,.obj,.3mf,.zip"
const MAX_FILE_BYTES = 50 * 1024 * 1024
const MAX_NOTE = 1000

const fileExt = (name) => String(name || "").split(".").pop().toLowerCase()

/** Browser-side grams estimate for STL/OBJ; null when the format cannot be measured. */
async function measureFile(file) {
  const ext = fileExt(file?.name)
  if (!["stl", "obj"].includes(ext)) return null
  try {
    const buffer = await file.arrayBuffer()
    const positions = ext === "stl" ? parseStlToPositions(buffer) : parseObjToPositions(buffer)
    if (!positions || positions.length < 9) return null
    const metrics = computeGeometryMetrics({ positions, sourceUnit: "mm" })
    if (!(metrics.volumeCm3 > 0)) return null
    const grams = estimateMaterialGrams({ volumeCm3: metrics.volumeCm3, dimensionsCm: metrics.dimensionsCm })
    return { grams, dimensionsCm: metrics.dimensionsCm, confidence: metrics.confidence }
  } catch {
    return null
  }
}

function exceedsBuild(dimensionsCm, maxBuildMm) {
  if (!dimensionsCm || !maxBuildMm) return false
  const dims = [dimensionsCm.length, dimensionsCm.width, dimensionsCm.height].map((v) => (Number(v) || 0) * 10).sort((a, b) => b - a)
  const build = [maxBuildMm.x, maxBuildMm.y, maxBuildMm.z].map((v) => Number(v) || 0).sort((a, b) => b - a)
  return dims.some((d, i) => d > build[i])
}

function CustomPrintRequestForm() {
  const { user, isLoaded } = useUser()
  const router = useRouter()
  const searchParams = useSearchParams()
  const creatorSlug = searchParams?.get("creator") || ""

  const [creator, setCreator] = useState(null) // { userId, displayName }
  const [service, setService] = useState(null)
  const [creatorState, setCreatorState] = useState(creatorSlug ? "loading" : "none") // loading | ready | unavailable | none

  const [note, setNote] = useState("")
  const [material, setMaterial] = useState("")
  const [colour, setColour] = useState("")
  const [file, setFile] = useState(null)
  const [measure, setMeasure] = useState(null)
  const [progress, setProgress] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!creatorSlug) {
      setCreatorState("none")
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/creators/${encodeURIComponent(creatorSlug)}/print-service`)
        const data = res.ok ? await res.json() : { enabled: false }
        if (cancelled) return
        if (data.enabled && data.service) {
          setCreator(data.creator)
          setService(data.service)
          setMaterial(data.service.materials?.[0]?.name || "")
          setColour(data.service.materials?.[0]?.colours?.[0] || "")
          setCreatorState("ready")
        } else {
          setCreatorState("unavailable")
        }
      } catch {
        if (!cancelled) setCreatorState("unavailable")
      }
    })()
    return () => { cancelled = true }
  }, [creatorSlug])

  const isCreatorFlow = creatorState === "ready" && creator && service
  const materials = service?.materials || []
  const selectedMaterial = materials.find((m) => m.name === material) || null
  const colours = selectedMaterial?.colours || []
  const accept = isCreatorFlow
    ? (service.acceptedFormats || []).map((f) => `.${f}`).join(",")
    : FIT_ACCEPT

  const estimate = useMemo(() => {
    if (!isCreatorFlow || !selectedMaterial) return null
    return estimateCreatorPrintPrice({
      grams: measure?.grams,
      pricePerGram: selectedMaterial.pricePerGram,
      minimumCharge: service.minimumCharge,
    })
  }, [isCreatorFlow, selectedMaterial, measure, service])

  const tooBig = isCreatorFlow && measure && exceedsBuild(measure.dimensionsCm, service.maxBuildMm)

  const handleFileChange = async (e) => {
    const f = e.target.files?.[0] || null
    setFile(f)
    setMeasure(null)
    setError("")
    if (!f) return
    if (f.size > MAX_FILE_BYTES) {
      setError("File too large. Maximum size is 50MB.")
      return
    }
    if (isCreatorFlow) {
      const ext = fileExt(f.name)
      if (!(service.acceptedFormats || []).includes(ext)) {
        setError(`${creator.displayName} accepts ${service.acceptedFormats.map((x) => x.toUpperCase()).join(", ")} files only.`)
        return
      }
      setMeasure(await measureFile(f))
    }
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
    if (isCreatorFlow && !selectedMaterial) {
      setError("Pick a material.")
      return
    }

    let s3Key = null
    try {
      setSubmitting(true)
      setProgress(0)

      // 1. Create the request (routed to the creator when in the creator flow).
      const createRes = await fetch("/api/custom-print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isCreatorFlow ? { creatorUserId: creator.userId } : {}),
      })
      const created = await createRes.json().catch(() => ({}))
      if (!createRes.ok || !created.requestId) throw new Error(created.error || "Failed to create request")
      const requestId = created.requestId

      // 2. Presigned upload straight to S3.
      const ext = fileExt(file.name)
      const contentType = file.type || getMimeType(ext)
      const signedRes = await fetch("/api/upload/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType }),
      })
      const signed = await signedRes.json().catch(() => ({}))
      if (!signedRes.ok || !signed.url) throw new Error(signed.error || "Failed to get upload URL")
      s3Key = signed.key
      await putWithProgress({ url: signed.url, body: file, contentType, onProgress: setProgress })

      // 3. Attach the model (+ the creator-flow material/colour) to the request.
      const payload = {
        requestId,
        modelFile: { originalName: file.name, s3Key, fileSize: file.size, uploadedAt: new Date().toISOString() },
        customerNote: note.slice(0, MAX_NOTE),
      }
      if (isCreatorFlow) {
        payload.printConfiguration = {
          generic: { material: selectedMaterial.name, colour: colour || null, strength: null, quality: null },
          isConfigured: true,
          configuredAt: new Date().toISOString(),
        }
        payload.statusNote = `Sent to ${creator.displayName}'s print service`
      }
      const putRes = await fetch("/api/custom-print", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!putRes.ok) {
        await fetch(`/api/upload/models?key=${encodeURIComponent(s3Key)}`, { method: "DELETE" }).catch(() => {})
        const data = await putRes.json().catch(() => ({}))
        throw new Error(data.error || "Failed to save request")
      }

      if (isCreatorFlow) {
        router.push("/account/prints")
      } else {
        router.push(`/editor?requestId=${encodeURIComponent(requestId)}`)
      }
    } catch (err) {
      setError(err.message || "Something went wrong")
      setProgress(0)
    } finally {
      setSubmitting(false)
    }
  }

  if (creatorState === "loading") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-sm text-gray-500">Loading print service…</p>
      </div>
    )
  }

  if (creatorState === "unavailable") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold mb-4">Print service unavailable</h1>
        <p className="text-sm text-gray-500 mb-6">
          This creator is not accepting print requests right now.
        </p>
        <Link href="/prints/request" className="inline-flex items-center px-4 py-2 text-sm font-medium rounded bg-black text-white">
          Request a print from Fix It Today instead
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold mb-4">Request a Custom Print</h1>

      {isCreatorFlow ? (
        <div className="mb-6 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm" role="status">
          <p className="font-medium">Requesting from {creator.displayName}</p>
          {service.headline && <p className="text-gray-700 mt-0.5">{service.headline}</p>}
          <p className="text-gray-600 mt-1">
            Lead time about {service.leadTimeDays} day{service.leadTimeDays === 1 ? "" : "s"}.
            {service.turnaroundNote ? ` ${service.turnaroundNote}` : ""} Payment is arranged directly with the creator.
          </p>
        </div>
      ) : (
        <p className="text-sm text-gray-500 mb-6">
          Upload your 3D model and details. We&apos;ll review, configure, and send you a quote.
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {isCreatorFlow && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="material">Material</label>
              <select
                id="material"
                value={material}
                onChange={(e) => {
                  setMaterial(e.target.value)
                  const next = materials.find((m) => m.name === e.target.value)
                  setColour(next?.colours?.[0] || "")
                }}
                className="w-full border rounded px-3 py-2 text-sm bg-white"
              >
                {materials.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} (SGD {Number(m.pricePerGram).toFixed(2)}/g)
                  </option>
                ))}
              </select>
              {selectedMaterial?.note && <p className="mt-1 text-xs text-gray-500">{selectedMaterial.note}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="colour">Colour</label>
              {colours.length > 0 ? (
                <select
                  id="colour"
                  value={colour}
                  onChange={(e) => setColour(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm bg-white"
                >
                  {colours.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-gray-500 py-2">Any colour (ask in your note)</p>
              )}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="file">3D model file</label>
          <input
            id="file"
            name="file"
            type="file"
            accept={accept}
            onChange={handleFileChange}
            className="w-full text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            {isCreatorFlow
              ? `Accepted: ${service.acceptedFormats.map((x) => x.toUpperCase()).join(", ")}. Max build ${service.maxBuildMm.x} x ${service.maxBuildMm.y} x ${service.maxBuildMm.z} mm. Max 50MB.`
              : "Supported: GLB, GLTF, STL, OBJ, 3MF, or ZIP containing these. Max 50MB."}
          </p>
        </div>

        {isCreatorFlow && file && !error && (
          <div className="rounded border px-4 py-3 text-sm" data-testid="creator-estimate">
            {estimate?.ok ? (
              <>
                <p>
                  Estimated from <span className="font-semibold">SGD {estimate.amount.toFixed(2)}</span>
                  {estimate.fromMinimum ? " (minimum charge)" : ` (about ${Math.round(measure.grams)} g)`}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Indicative only. {creator.displayName} will send the final quote.</p>
              </>
            ) : (
              <p>Quote on review. {creator.displayName} will send a quote after checking the model.</p>
            )}
            {tooBig && (
              <p className="text-xs text-red-600 mt-1">
                This model looks larger than the creator&apos;s build volume. They may need to split or decline it.
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="notes">Notes (optional)</label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            value={note}
            maxLength={MAX_NOTE}
            onChange={(e) => setNote(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder={isCreatorFlow ? "Deadline, finish, quantity, or anything the creator should know" : "Deadlines, preferred material, colors, or other constraints"}
          />
        </div>

        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded bg-black text-white disabled:opacity-60"
        >
          {submitting ? (progress > 0 && progress < 100 ? `Uploading ${progress}%` : "Submitting...") : isCreatorFlow ? `Send to ${creator.displayName}` : "Submit Request"}
        </button>
      </form>
    </div>
  )
}

export default function CustomPrintRequestPage() {
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto px-4 py-8 text-sm text-gray-500">Loading…</div>}>
      <CustomPrintRequestForm />
    </Suspense>
  )
}
