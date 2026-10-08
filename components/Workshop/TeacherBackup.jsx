'use client'
import { useState } from 'react'

export default function TeacherBackup() {
    const [requested, setRequested] = useState(false)
    return <section aria-label="Class backup" className="border rounded-xl p-5 mt-6">
        <h2 className="text-xl font-semibold">Keep an Excel copy</h2>
        <p className="mt-2">Download all submitted answers, with drafts, saved history and Trash in separate tabs. Each copy includes the names, groups and Singapore-time timestamps saved at that moment.</p>
        <a href="/api/admin/workshop/backup" className="formBlackButton inline-flex mt-4" download onClick={() => setRequested(true)}>Download Excel backup</a>
        <p className="text-sm mt-3">Save the ZIP in <strong>E:\FIT Workshop\Backups</strong>, then open the numbered Excel files inside. Download again after class to include later responses.</p>
        {requested && <p role="status" className="text-sm mt-3">Your browser handles the download. Server responses remain saved. This copy includes retained autosaves, not text that has not reached the server.</p>}
    </section>
}
