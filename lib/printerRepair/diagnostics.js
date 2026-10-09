import { FabricationError, failure } from '@/lib/fabrication/serverHttp'

const operations = ['submit', 'recover', 'detail', 'withdraw', 'staff_queue', 'staff_detail', 'staff_retry']
const reasons = ['rate_limit_unavailable', 'storage_unavailable', 'service_unavailable']
const errorTypes = ['Error', 'MongoServerError', 'MongoNetworkError', 'MongoServerSelectionError', 'MongooseServerSelectionError', 'ValidationError']

export function repairFailure(error, operation) {
  if ((error?.status || 503) >= 500) console.warn('Printer repair unavailable', {
    operation: operations.includes(operation) ? operation : 'request',
    reason: reasons.includes(error?.code) ? error.code : 'service_unavailable',
    errorType: error instanceof FabricationError ? 'FabricationError' : errorTypes.includes(error?.name) ? error.name : 'Error',
    ...(Number.isSafeInteger(error?.code) ? { errorCode: error.code } : {}),
  })
  return failure(error)
}

const photoLogs = new Map()
export function reportPhotoReadiness(error) {
  let reason = error ? 'storage_verification_failed' : 'storage_not_configured'
  if (error instanceof FabricationError && error.code === 'storage_unavailable') {
    if (error.message === 'Private fabrication storage is not configured.') reason = 'storage_not_configured'
    if (error.message === 'Private fabrication storage could not be verified.') reason = 'storage_access_unverified'
    if (error.message === 'Fabrication storage must have all public-access blocks enabled.') reason = 'storage_public_access_not_blocked'
  }
  // Public readiness can be refreshed often. Log only a bounded category once
  // per minute; never include the error message, bucket, account or credentials.
  if ((photoLogs.get(reason) || 0) > Date.now() - 60000) return
  photoLogs.set(reason, Date.now())
  console.warn('Printer repair photo readiness', { reason })
}
