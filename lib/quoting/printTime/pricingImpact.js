// Pure: "is calibration moving my prices, and where?" — summarises the two
// print-time estimates recorded on every persisted quote (printTimeSource,
// printHoursHeuristic, printHoursShapeAware) so the admin can see the effect of
// their calibration in the Print Timing panel. No DB, no network.

const ratioOf = (inputs) => {
  const shape = Number(inputs?.printHoursShapeAware)
  const heuristic = Number(inputs?.printHoursHeuristic)
  if (!(shape > 0) || !(heuristic > 0) || !Number.isFinite(shape) || !Number.isFinite(heuristic)) {
    return null
  }
  return shape / heuristic
}

const median = (sorted) => {
  if (!sorted.length) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * @param {Array<{requestId?:string, quotedAt?:any, quote?:{total?:number, currency?:string, inputs?:object}}>} quotes
 * @param {number} [moverLimit=5] how many biggest movers to surface
 * @returns {{total:number, shapeAwarePriced:number, heuristicPriced:number,
 *   comparable:number, medianRatio:number|null, movers:Array<object>}}
 */
export function summarisePricingImpact(quotes = [], moverLimit = 5) {
  let shapeAwarePriced = 0
  const ratios = []
  const rows = []

  for (const q of quotes) {
    const inputs = q?.quote?.inputs
    if (!inputs) continue
    const source = inputs.printTimeSource || 'heuristic'
    if (source === 'shape-aware') shapeAwarePriced += 1
    const ratio = ratioOf(inputs)
    if (ratio != null) {
      ratios.push(ratio)
      rows.push({
        requestId: q.requestId || null,
        quotedAt: q.quotedAt || null,
        total: q.quote?.total ?? null,
        currency: q.quote?.currency || '',
        source,
        printHours: Number(inputs.printHours) || 0,
        printHoursHeuristic: Number(inputs.printHoursHeuristic) || 0,
        printHoursShapeAware: Number(inputs.printHoursShapeAware) || 0,
        ratio,
      })
    }
  }

  // Biggest movers = furthest from parity in either direction, since a
  // calibration that makes everything cheaper is as notable as one that does
  // not.
  const movers = rows
    .slice()
    .sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1))
    .slice(0, Math.max(0, moverLimit))

  const total = quotes.filter((q) => q?.quote?.inputs).length
  return {
    total,
    shapeAwarePriced,
    heuristicPriced: total - shapeAwarePriced,
    comparable: ratios.length,
    medianRatio: median(ratios.slice().sort((a, b) => a - b)),
    movers,
  }
}
