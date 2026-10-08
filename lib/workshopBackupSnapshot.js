import { connectToDatabase } from './db'
import { scopedWorkshopDatabase } from './workshopDatabase'
import { readBackupSnapshot } from './workshopBackupData'

export async function openWorkshopBackupSnapshot(signal) {
    const connection = (await connectToDatabase()).connection
    const session = connection.getClient().startSession({ snapshot: true, causalConsistency: false })
    let closed = false
    const close = async () => { if (!closed) { closed = true; await session.endSession() } }
    try { return { ...await readBackupSnapshot(scopedWorkshopDatabase(connection.db), session, { signal }), close } }
    catch (error) { await close(); throw error }
}
