import { workshopDatabase } from './workshopDatabase'
import { classFailure, classJson, jsonBody, sameOrigin, limitClassOperation } from './workshopHttp'
export { classFailure, classJson, jsonBody, sameOrigin }
export const guestDb = workshopDatabase
export async function limitGuestOperation(db, key, limit) { return limitClassOperation({ collection(name) { if (name !== 'workshopRateLimits') throw Error('Invalid guest rate-limit collection.'); return db.collection('workshopGuestRateLimits') } }, key, limit) }
