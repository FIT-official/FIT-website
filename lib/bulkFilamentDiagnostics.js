const stages = {
  request: 'Bulk request unavailable',
  database: 'Database unavailable',
  inventory: 'Inventory unavailable',
  'inventory-credentials': 'Inventory credentials unavailable',
  'inventory-authentication': 'Inventory authentication unavailable',
  'inventory-sheet': 'Inventory Sheet unavailable',
  'inventory-parse': 'Inventory parsing unavailable',
  'shop-products': 'Shop products unavailable',
  'bambu-mapping': 'Bambu catalogue unavailable',
  'lanbo-mapping': 'Lanbo catalogue unavailable',
}
const names = new Set(['Error', 'TypeError', 'SyntaxError', 'RangeError', 'AggregateError',
  'AbortError', 'TimeoutError', 'MongoError', 'MongoServerError', 'MongoNetworkError',
  'MongoNetworkTimeoutError', 'MongoServerSelectionError', 'MongooseServerSelectionError', 'MongoParseError'])
const messages = new Set(['Incomplete FIT inventory credentials', 'Inventory authentication unavailable',
  'Inventory Sheet unavailable', 'Conflicting inventory identities', 'Bambu catalogue needs current variant prices'])
const errorStages = new WeakMap()

export async function bulkStage(stage, operation) {
  try { return await operation() }
  catch (error) {
    const failure = error instanceof Error ? error : new Error('Bulk operation unavailable')
    if (!errorStages.has(failure)) errorStages.set(failure, stage)
    throw failure
  }
}

export function bulkFailureDiagnostic(error) {
  const candidate = error && typeof error === 'object' ? errorStages.get(error) : undefined
  const stage = Object.hasOwn(stages, candidate) ? candidate : 'request'
  // Dependency errors can quote credential JSON, keys, Mongo URIs, tokens or
  // fragments of environment values. Only known literal messages and validated
  // inventory identities may enter logs; never serialize an error/cause/stack.
  const message = error?.message
  const knownMessage = typeof message === 'string' && (messages.has(message) ||
    /^Inventory (?:authentication|Sheet) unavailable \(HTTP [45]\d{2}\)$/.test(message) ||
    /^Conflicting inventory identities: (?:Lanbo|FIT):(?:PLA|PETG):\d{1,20}$/.test(message))
  return {
    name: names.has(error?.name) ? error.name : 'Error',
    message: knownMessage ? message : `${stages[stage]} (details redacted)`,
    stage,
  }
}
