import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectToDatabase } from '@/lib/db'
import AppSettings from '@/models/AppSettings'
import { authenticate } from '@/lib/authenticate'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'
import { getAppSettingsId } from '@/lib/appSettingsId'
import { parseModelToPositions } from '@/lib/quoting/serverGeometry'
import {
  layerStackComponents,
  hoursFromLayerStackComponents,
  resolveLayerStackModel,
  DEFAULT_LAYER_STACK_MODEL,
} from '@/lib/quoting/printTime/layerStack'
import { comparePrintTimes, fitLayerStackConstants } from '@/lib/quoting/printTime/validate'
import { summarisePricingImpact } from '@/lib/quoting/printTime/pricingImpact'
import CustomPrintRequest from '@/models/CustomPrintRequest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Calibration models are one-off test prints, not customer uploads.
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024

const SettingsSchema = z
  .object({
    layerHeightMm: z.number().finite().min(0.05).max(5).default(0.2),
    infillPercent: z.number().finite().min(0).max(100).default(20),
    wallLoops: z.number().finite().min(0).max(20).default(2),
    enableSupport: z.boolean().default(false),
  })
  .strict()

const UpdateSchema = z
  .discriminatedUnion('action', [
    z
      .object({
        action: z.literal('update'),
        id: z.string().min(1),
        actualHours: z.number().finite().positive().max(1000).nullable().optional(),
        label: z.string().max(120).optional(),
      })
      .strict(),
    z.object({ action: z.literal('delete'), id: z.string().min(1) }).strict(),
    z.object({ action: z.literal('apply') }).strict(),
  ])

async function requireAdminSettings(req) {
  const { userId } = await authenticate(req)
  if (!(await checkAdminPrivileges(userId))) return { error: 403 }
  await connectToDatabase()
  let settings = await AppSettings.findById(getAppSettingsId())
  if (!settings) {
    settings = new AppSettings({ _id: getAppSettingsId() })
    await settings.save()
  }
  return { settings }
}

// How many recent quotes to summarise for the pricing-impact panel.
const IMPACT_SAMPLE_SIZE = 100

/**
 * "Is my calibration moving prices, and where?" — read straight off the two
 * estimates every persisted quote records. Read-only; failures degrade to null
 * so the calibration panel still loads.
 */
async function pricingImpact() {
  try {
    const quotes = await CustomPrintRequest.find({
      'quote.inputs.printHours': { $exists: true },
    })
      .select('requestId quotedAt quote.total quote.currency quote.inputs')
      .sort({ quotedAt: -1 })
      .limit(IMPACT_SAMPLE_SIZE)
      .lean()
    return summarisePricingImpact(quotes)
  } catch (err) {
    console.error('Calibration pricing impact failed:', err)
    return null
  }
}

async function calibrationView(settings) {
  const stored = settings.quotingConfig?.layerStackModel
  const appliedRaw = stored?.toObject?.() || stored || {}
  const hasApplied = appliedRaw.flowMm3PerS > 0
  const activeModel = resolveLayerStackModel(appliedRaw)

  const samples = (settings.printTimeCalibration?.samples || []).map((s) => ({
    id: String(s._id),
    label: s.label || s.fileName,
    fileName: s.fileName,
    settings: s.settings?.toObject?.() || s.settings,
    actualHours: s.actualHours,
    estimatedHours: hoursFromLayerStackComponents(s, activeModel),
  }))

  const timedDocs = (settings.printTimeCalibration?.samples || []).filter(
    (s) => s.actualHours > 0,
  )

  let fit = null
  const constants = fitLayerStackConstants(timedDocs)
  if (constants) {
    const fittedModel = { ...DEFAULT_LAYER_STACK_MODEL, ...constants }
    const { summary } = comparePrintTimes(
      timedDocs.map((s) => ({
        label: String(s._id),
        actualHours: s.actualHours,
        estimates: {
          current: hoursFromLayerStackComponents(s, activeModel),
          fitted: hoursFromLayerStackComponents(s, fittedModel),
        },
      })),
    )
    fit = {
      flowMm3PerS: constants.flowMm3PerS,
      perLayerOverheadS: constants.perLayerOverheadS,
      samplesUsed: constants.samplesUsed,
      currentMeanAbsPctError: summary.current?.meanAbsPctError ?? null,
      fittedMeanAbsPctError: summary.fitted?.meanAbsPctError ?? null,
    }
  }

  return {
    samples,
    timedCount: timedDocs.length,
    fit,
    applied: hasApplied
      ? {
          flowMm3PerS: appliedRaw.flowMm3PerS,
          perLayerOverheadS: appliedRaw.perLayerOverheadS,
          fittedAt: settings.printTimeCalibration?.fittedAt || null,
        }
      : null,
    impact: await pricingImpact(),
  }
}

export async function GET(req) {
  try {
    const { settings, error } = await requireAdminSettings(req)
    if (error) return NextResponse.json({ error: 'Access denied.' }, { status: error })
    return NextResponse.json(await calibrationView(settings))
  } catch (err) {
    console.error('Calibration GET failed:', err)
    return NextResponse.json({ error: 'Failed to load calibration' }, { status: 500 })
  }
}

// POST — add a test print: multipart form with `file` + settings fields.
// The model is parsed once for its shape components; bytes are not stored.
export async function POST(req) {
  try {
    const contentLength = Number(req.headers.get('content-length') || 0)
    if (contentLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'File too large (max 40MB)' }, { status: 413 })
    }
    const { settings, error } = await requireAdminSettings(req)
    if (error) return NextResponse.json({ error: 'Access denied.' }, { status: error })

    const form = await req.formData()
    const file = form.get('file')
    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'Missing model file' }, { status: 400 })
    }
    const parsedSettings = SettingsSchema.safeParse({
      layerHeightMm: Number(form.get('layerHeightMm') || 0.2),
      infillPercent: Number(form.get('infillPercent') || 20),
      wallLoops: Number(form.get('wallLoops') || 2),
      enableSupport: String(form.get('enableSupport')) === 'true',
    })
    if (!parsedSettings.success) {
      return NextResponse.json({ error: 'Invalid print settings' }, { status: 400 })
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const parsed = await parseModelToPositions(bytes, file.name)
    if (!parsed) {
      return NextResponse.json(
        { error: 'Could not read that file — use STL, OBJ, GLB/glTF, or 3MF' },
        { status: 422 },
      )
    }
    const components = layerStackComponents({ ...parsed, settings: parsedSettings.data })
    if (!components) {
      return NextResponse.json({ error: 'Model has no printable geometry' }, { status: 422 })
    }

    settings.printTimeCalibration = settings.printTimeCalibration || { samples: [] }
    settings.printTimeCalibration.samples.push({
      label: String(form.get('label') || '').slice(0, 120) || file.name,
      fileName: file.name,
      settings: parsedSettings.data,
      ...components,
    })
    await settings.save()
    return NextResponse.json(await calibrationView(settings))
  } catch (err) {
    console.error('Calibration POST failed:', err)
    return NextResponse.json({ error: 'Failed to add test print' }, { status: 500 })
  }
}

// PUT — update a sample's actual time/label, delete a sample, or apply the fit.
export async function PUT(req) {
  try {
    const { settings, error } = await requireAdminSettings(req)
    if (error) return NextResponse.json({ error: 'Access denied.' }, { status: error })

    let body
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const parsed = UpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 })
    }

    const cal = settings.printTimeCalibration || { samples: [] }
    if (parsed.data.action === 'update') {
      const sample = cal.samples.id(parsed.data.id)
      if (!sample) return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
      if ('actualHours' in parsed.data) sample.actualHours = parsed.data.actualHours ?? null
      if ('label' in parsed.data) sample.label = parsed.data.label
    } else if (parsed.data.action === 'delete') {
      const sample = cal.samples.id(parsed.data.id)
      if (!sample) return NextResponse.json({ error: 'Sample not found' }, { status: 404 })
      sample.deleteOne()
    } else {
      const timed = cal.samples
        .filter((s) => s.actualHours > 0)
        .map((s) => ({
          extrudedMm3: s.extrudedMm3,
          totalLayers: s.totalLayers,
          supportOn: s.supportOn,
          actualHours: s.actualHours,
        }))
      const constants = fitLayerStackConstants(timed)
      if (!constants) {
        return NextResponse.json(
          {
            error:
              'Not enough shape-diverse timed prints to calibrate — add at least two ' +
              'differently-shaped prints (e.g. one flat plate and one tall part) with their times.',
          },
          { status: 422 },
        )
      }
      const current = settings.quotingConfig?.toObject?.() || settings.quotingConfig || {}
      settings.quotingConfig = {
        ...current,
        layerStackModel: {
          flowMm3PerS: constants.flowMm3PerS,
          perLayerOverheadS: constants.perLayerOverheadS,
        },
      }
      cal.fittedAt = new Date()
    }
    settings.printTimeCalibration = cal
    await settings.save()
    return NextResponse.json(await calibrationView(settings))
  } catch (err) {
    console.error('Calibration PUT failed:', err)
    return NextResponse.json({ error: 'Failed to update calibration' }, { status: 500 })
  }
}
