/**
 * Validation for admin updates to the quoting config + colour catalogue.
 * Kept pure/separate so it is unit-testable without Next/Clerk/Mongoose.
 */
import { z } from 'zod'

const fee = z.number().finite().min(0).max(1_000_000)

// Machine-speed model for the print-time estimate (null = use the default).
export const TimeModelSchema = z
  .object({
    baseFlowCm3PerHour: z.number().finite().positive().max(1_000).nullable().optional(),
    layerHeightRefMm: z.number().finite().positive().max(5).nullable().optional(),
    supportTimeFactor: z.number().finite().min(1).max(10).nullable().optional(),
    wallTimeFactorPerLoop: z.number().finite().min(0).max(5).nullable().optional(),
    minHours: z.number().finite().min(0).max(100).nullable().optional(),
  })
  .strict()

export const QuotingConfigSchema = z
  .object({
    timeModel: TimeModelSchema.optional(),
    materialRatePerGram: z.number().finite().min(0).max(10_000).optional(),
    printTimeRatePerHour: fee.optional(),
    baseFee: fee.optional(),
    postProcessingFee: fee.optional(),
    specialRequestFee: fee.optional(),
    priorityFee: fee.optional(),
    expediteMode: z.enum(['percent', 'flat', 'greater']).optional(),
    expediteSurchargePercent: z.number().finite().min(0).max(100_000).optional(),
    expediteSurchargeFlat: fee.optional(),
    minimumPrice: fee.optional(),
  })
  .strict()

const ColourSchema = z
  .object({
    name: z.string().min(1).max(60),
    hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'hex must be #RRGGBB'),
    material: z.string().max(40).nullable().optional(),
    priceModifier: z.number().finite().nullable().optional(),
  })
  .strict()

export const PrintColoursSchema = z.array(ColourSchema).max(200)

// Machine capacity limits (cm / kg). Null clears a limit (= unlimited).
const limit = z.number().finite().positive().max(100_000).nullable()
export const MachineLimitsSchema = z
  .object({
    maxLengthCm: limit.optional(),
    maxWidthCm: limit.optional(),
    maxHeightCm: limit.optional(),
    maxWeightKg: limit.optional(),
  })
  .strict()

export const QuotingUpdateSchema = z
  .object({
    quotingConfig: QuotingConfigSchema.optional(),
    printColours: PrintColoursSchema.optional(),
    machineLimits: MachineLimitsSchema.optional(),
  })
  .strict()

/**
 * @returns {{ok:true,status:200,data} | {ok:false,status:400,error,issues}}
 */
export function buildQuotingUpdate(raw) {
  const parsed = QuotingUpdateSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, status: 400, error: 'Invalid quoting config', issues: parsed.error.issues }
  }
  if (!parsed.data.quotingConfig && !parsed.data.printColours && !parsed.data.machineLimits) {
    return { ok: false, status: 400, error: 'Nothing to update' }
  }
  return { ok: true, status: 200, data: parsed.data }
}
