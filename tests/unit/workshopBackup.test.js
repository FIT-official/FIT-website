// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { backupSubmission, backupDraft, backupAudit, backupSources, readBackupSnapshot } from '@/lib/workshopBackupData'
import { createBackupArchive, backupColumns } from '@/lib/workshopBackupWorkbook'

const source = backupSources[0], at = '2026-10-09T01:02:03.000Z'
const raw = { id: 'test-receipt', seat: 'opaque-session', studentName: '李 芳 🌱', visitingGroup: 'g2', presentingGroup: 'g3', idea: '1', reviewRound: 2, whatWorks: '=HYPERLINK("https://example.invalid")\n漂亮, "quoted"', question: '+SUM(1,2)', improvement: '@test\nSecond line', recordedAt: at, version: 1, visibility: 'visible', password: 'NEVER-EXPORT', payloadHash: 'NEVER-EXPORT' }
const normal = () => backupSubmission(raw, 'feedback', source)
const metadata = expected => ({ format: 'fit-workshop-backup-v1', session: '2026-10-09', capturedAt: at, expected: { feedback: 0, refinement: 0, trash: 0, audit: 0, draft: 0, draftSnapshots: 0, ...expected }, notes: [] })
async function build(records, counts, options = {}) {
    const snapshot = { metadata: metadata(counts), records: (async function* () { yield* records })() }, backup = createBackupArchive(snapshot, options)
    const chunks = []; for await (const chunk of backup.stream) chunks.push(chunk)
    const manifest = await backup.done, bytes = Buffer.concat(chunks), zip = await JSZip.loadAsync(bytes)
    return { manifest, bytes, zip }
}
async function excel(zip, name = 'Excel/FIT-workshop-part-001.xlsx') { const book = new ExcelJS.Workbook(); await book.xlsx.load(await zip.file(name).async('nodebuffer')); return book }

describe('complete private Excel workshop backup', () => {
    it('preserves Unicode, multiline answers and potentially dangerous strings as text, never formulas', async () => {
        const { zip, manifest } = await build([normal()], { feedback: 1 }), book = await excel(zip), sheet = book.getWorksheet('Feedback')
        expect(sheet.getCell('B2').value).toBe(raw.studentName)
        expect(sheet.getCell('F2').value).toBe(raw.whatWorks); expect(sheet.getCell('F2').type).toBe(ExcelJS.ValueType.String)
        expect(sheet.getCell('G2').value).toBe(raw.question); expect(sheet.getCell('H2').value).toBe(raw.improvement)
        for (const ws of book.worksheets) ws.eachRow(row => row.eachCell(cell => expect(cell.type).not.toBe(ExcelJS.ValueType.Formula)))
        expect(manifest.actual.feedback).toBe(1)
    })
    it('keeps source timestamps and exports sortable Singapore-time dates', async () => {
        const { zip } = await build([normal()], { feedback: 1 }), book = await excel(zip), sheet = book.getWorksheet('Feedback')
        expect(sheet.getCell('I2').value.getTime()).toBe(Date.parse(at) + 8 * 3600000)
        expect(sheet.getCell('I2').numFmt).toContain('SGT')
        const record = JSON.parse((await zip.file('Archive/records-001.jsonl').async('text')).trim()); expect(record.submittedAt).toBe(at)
    })
    it('sets readable headers, filters, frozen panes, widths and wrapped full text', async () => {
        const { zip } = await build([normal()], { feedback: 1 }), book = await excel(zip), sheet = book.getWorksheet('Feedback')
        expect(book.worksheets.map(row => row.name)).toEqual(['Overview', ...Object.keys(backupColumns)])
        expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1, xSplit: 2 })
        expect(sheet.autoFilter).toBeTruthy(); expect(sheet.getColumn(6).width).toBe(55); expect(sheet.getCell('F2').alignment.wrapText).toBe(true)
        expect(sheet.getColumn(13).hidden).toBe(true); expect(sheet.getColumn(14).hidden).toBe(true)
    })
    it('keeps Trash, submissions, autosaved drafts and retained historical snapshots separate', async () => {
        const draft = backupDraft({ _id: 'd1', seat: raw.seat, group: 'g2', topic: 'feedback-r2-g3-idea1', version: 2, updatedAt: at, snapshots: [{ version: 1, savedAt: at, content: { whatWorks: 'first draft', question: '', improvement: '' } }, { version: 2, savedAt: at, content: { whatWorks: 'later draft', question: 'why?', improvement: 'try' } }] }, source, new Map([[raw.seat, raw.studentName]]))
        const trash = backupSubmission({ ...raw, id: 'trash', visibility: 'deleted' }, 'feedback', source)
        const { zip, manifest } = await build([normal(), trash, draft], { feedback: 1, trash: 1, draft: 1, draftSnapshots: 2 }), book = await excel(zip)
        expect(book.getWorksheet('Feedback').rowCount).toBe(2); expect(book.getWorksheet('Trash').rowCount).toBe(2)
        expect(book.getWorksheet('Drafts').rowCount).toBe(2); expect(book.getWorksheet('Draft history').rowCount).toBe(3)
        expect(manifest.actual).toMatchObject({ feedback: 1, trash: 1, draft: 1, draftSnapshots: 2 })
    })
    it('exports both improvement ideas without losing contribution identity', async () => {
        const entry = backupSubmission({ id: 'r1', seat: raw.seat, studentName: raw.studentName, group: 'g2', version: 4, authorVersion: 2, entryVersion: 3, promptVersion: 2, recordedAt: at, ideas: [{ idea: '1', change: 'change1', reason: 'reason1', test: 'test1' }, { idea: '2', change: 'change2', reason: 'reason2', test: 'test2' }] }, 'refinement', source)
        const { zip, manifest } = await build([entry], { refinement: 1 }), sheet = (await excel(zip)).getWorksheet('Improvements')
        expect(sheet.rowCount).toBe(3); expect(sheet.getCell('D2').value).toBe('1'); expect(sheet.getCell('D3').value).toBe('2'); expect(manifest.actual.refinement).toBe(1)
        expect(sheet.getCell('P2').value).toBe(sheet.getCell('P3').value)
    })
    it('splits large exports without truncation and verifies every part hash and row count', async () => {
        const records = Array.from({ length: 1001 }, (_, index) => ({ ...normal(), reference: 'r' + index }))
        const { manifest, zip } = await build(records, { feedback: 1001 }, { maxRowsPerPart: 200, archiveRecordsPerPart: 250 })
        expect(manifest.workbookParts).toBe(6); expect(manifest.archiveParts).toBe(5)
        let excelRows = 0, archivedRecords = 0
        for (const file of manifest.files) {
            const bytes = await zip.file(file.name).async('nodebuffer'); expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256); expect(bytes.length).toBe(file.bytes)
            if (file.name.endsWith('.xlsx')) { const book = await excel(zip, file.name); const count = book.getWorksheet('Feedback').rowCount - 1; expect(count).toBe(file.sheetRows.Feedback); excelRows += count }
            if (file.name.endsWith('.jsonl')) archivedRecords += bytes.toString('utf8').trim().split('\n').length
        }
        expect(excelRows).toBe(1001); expect(archivedRecords).toBe(1001)
    }, 30000)
    it('preserves text beyond the Excel cell limit in ordered continuation rows and exact archival text', async () => {
        const text = '完整🌱\n'.repeat(9000), entry = { ...normal(), answers: { ...normal().answers, whatWorks: text } }
        const { zip } = await build([entry], { feedback: 1 }), book = await excel(zip), long = book.getWorksheet('Long answers')
        let reconstructed = ''; long.eachRow((row, index) => { if (index > 1) reconstructed += row.getCell(5).value })
        expect(reconstructed).toBe(text); expect(book.getWorksheet('Feedback').getCell('F2').value).toContain('Long answers')
        expect(JSON.parse((await zip.file('Archive/records-001.jsonl').async('text')).trim()).answers.whatWorks).toBe(text)
    })
    it('whitelists data and never serializes auth, password, hash or Tinkercad pool fields', async () => {
        const audit = backupAudit({ action: 'feedback', actor: 'PRIVATE-CLERK-ID', at, before: raw, after: { ...raw, whatWorks: 'edited', classLink: 'NEVER-EXPORT', sessionToken: 'NEVER-EXPORT' }, credentials: 'NEVER-EXPORT' }, source, new Map(), 0)
        const { zip } = await build([normal(), audit], { feedback: 1, audit: 1 })
        const content = await zip.file('Archive/records-001.jsonl').async('text'); expect(content).not.toMatch(/NEVER-EXPORT|PRIVATE-CLERK-ID|opaque-session|payloadHash|sessionToken|classLink|password/)
        const book = await excel(zip); const all = JSON.stringify(book.model); expect(all).not.toMatch(/NEVER-EXPORT|PRIVATE-CLERK-ID|opaque-session/)
    })
    it('produces a valid empty workbook with explicit zero counts', async () => { const { zip, manifest } = await build([], {}); expect(manifest.workbookParts).toBe(1); expect((await excel(zip)).getWorksheet('Feedback').rowCount).toBe(1); expect(manifest.complete).toBe(true) })
    it('fails a mismatched count instead of declaring a complete partial backup', async () => { await expect(build([normal()], { feedback: 2 })).rejects.toThrow('count verification') })
    it('does not silently fall back to inconsistent reads when a snapshot fails', async () => { const db = { collection: () => ({ findOne: async () => { throw Error('SnapshotTooOld') } }) }; await expect(readBackupSnapshot(db, {}, {})).rejects.toThrow('SnapshotTooOld') })
    it('preserves genuine multilingual, surrogate-pair and XML-incompatible text in the archival copy', async () => {
        const name = '\u674e\u82b3 \u0ba4\u0bae\u0bbf\u0bb4\u0bcd', text = '\u4e2d\u6587\ud83d\ude42\n\u0001'.repeat(6000)
        const { zip } = await build([{ ...normal(), studentName: name, answers: { ...normal().answers, whatWorks: text } }], { feedback: 1 })
        const book = await excel(zip)
        expect(book.getWorksheet('Feedback').getCell('B2').value).toBe(name)
        const archived = JSON.parse((await zip.file('Archive/records-001.jsonl').async('text')).trim())
        expect(archived.studentName).toBe(name); expect(archived.answers.whatWorks).toBe(text)
        let reconstructed = ''; book.getWorksheet('Long answers').eachRow((row, index) => { if (index > 1) reconstructed += row.getCell(5).value })
        expect(reconstructed).toBe(text.replaceAll('\u0001', '[U+0001]'))
    })
    it('cancels an in-progress workbook when the browser aborts without declaring completion', async () => {
        const controller = new AbortController()
        const snapshot = { metadata: metadata({ feedback: 1000 }), records: (async function* () { for (let i = 0; i < 1000; i++) yield { ...normal(), answers: { whatWorks: 'long answer '.repeat(100), question: 'why', improvement: 'try' } } })() }
        const backup = createBackupArchive(snapshot, { signal: controller.signal, maxRowsPerPart: 100 })
        const draining = (async () => { for await (const chunk of backup.stream) { if (chunk.length) controller.abort() } })()
        await expect(draining).rejects.toThrow()
        await expect(backup.done).rejects.toThrow('canceled')
    }, 5000)
    it('stops its producer when the web response consumer disconnects', async () => {
        const backup = createBackupArchive({ metadata: metadata({ feedback: 1000 }), records: (async function* () { for (let i = 0; i < 1000; i++) yield normal() })() }, { maxRowsPerPart: 100 })
        const reader = Readable.toWeb(backup.stream).getReader()
        await reader.read(); await reader.cancel()
        await expect(backup.done).rejects.toThrow()
    }, 3000)
    it('pauses record generation when a browser stops reading a large export', async () => {
        let produced = 0
        const backup = createBackupArchive({ metadata: metadata({ feedback: 1000 }), records: (async function* () { for (let i = 0; i < 1000; i++) { produced++; yield { ...normal(), reference: String(i) } } })() }, { maxRowsPerPart: 20 })
        backup.stream.on('error', () => {})
        try {
            let previous = -1
            await vi.waitFor(() => {
                const unchanged = produced === previous; previous = produced
                expect(backup.stream.writableNeedDrain).toBe(true)
                expect(produced).toBeLessThan(1000)
                expect(unchanged).toBe(true)
            }, { interval: 100, timeout: 3000 })
        } finally { backup.cancel(); await backup.done.catch(() => {}) }
    }, 5000)
})
