/**
 * Access policy for the S3 proxy (`/api/proxy`).
 *
 * Public prefixes (product/blog images, public viewable models) stream
 * anonymously as before. Customer-uploaded print models under `models/` are
 * private: visible to the request owner, to a buyer whose digital-product
 * purchase includes the file, and to admins. Unknown callers get the same 404
 * as a missing object (no existence oracle).
 */
import { connectToDatabase } from '@/lib/db'
import CustomPrintRequest from '@/models/CustomPrintRequest'
import DigitalProductTransaction from '@/models/DigitalProductTransaction'
import { checkAdminPrivileges } from '@/lib/checkPrivileges'

/** Pure: keys under models/ hold customer-uploaded print files. */
export function isPrivateModelKey(key) {
  return /^models\//.test(String(key || ''))
}

/**
 * Whether `userId` (Clerk id) may read the private model at `key`.
 * Owner of the custom-print request, buyer of a digital product containing the
 * asset, or admin. (The legacy PrintOrder check was removed 2026-07-05 after
 * the backfill dry-run found zero PrintOrders to migrate.)
 */
export async function canAccessModelKey(key, userId) {
  if (typeof userId !== 'string' || !userId) return false
  await connectToDatabase()
  const [ownsRequest, purchased] = await Promise.all([
    CustomPrintRequest.exists({ userId, 'modelFile.s3Key': key }),
    DigitalProductTransaction.exists({ userId, assets: key }),
  ])
  if (ownsRequest || purchased) return true

  return checkAdminPrivileges(userId)
}
