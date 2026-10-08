import ExcelJS from 'exceljs'
import archiver from 'archiver'
import { PassThrough, Transform } from 'node:stream'
import { createHash } from 'node:crypto'

const group = value => /^g(?:[1-9]|10)$/.test(value || '') ? 'Group ' + value.slice(1) : 'Unavailable'
const status = value => ({ visible: 'Visible to students', hidden: 'Hidden from students', blocked: 'Blocked from students', deleted: 'In Trash' }[value] || value || '')
const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value) + 8 * 3600000) : null
const labels = { whatWorks: 'What works well, and why?', question: 'What question would you ask the presenters?', improvement: 'What specific improvement do you suggest?', feedbackUsed: 'Feedback used (earlier question)', change: 'What would you change to improve this idea?', reason: 'Why would this improve the idea?', test: 'How would you test this change?' }
const common = [['home', 'Home group', 16], ['name', 'Student name', 28], ['target', 'Target group', 16], ['idea', 'Idea', 10], ['round', 'Round', 10]]
const refs = [['source', 'Entry method', 24], ['reference', 'Record reference', 30, true], ['studentReference', 'Student reference', 30, true]]
const times = [['submitted', 'Submitted (SGT / UTC+08:00)', 26], ['updated', 'Updated (SGT / UTC+08:00)', 26], ['status', 'Status', 26]]
const feedback = ['whatWorks', 'question', 'improvement'].map(key => [key, labels[key], 55])
const refinement = ['feedbackUsed', 'change', 'reason', 'test'].map(key => [key, labels[key], 55])
const allAnswers = [...feedback, ...refinement]
export const backupColumns = {
    Feedback: [...common, ...feedback, ...times, ...refs],
    Improvements: [...common, ['revision', 'Student revision', 16], ...refinement, ...times, ...refs],
    Drafts: [...common, ['activity', 'Activity', 16], ...allAnswers, ['updated', 'Last autosave (SGT / UTC+08:00)', 28], ['version', 'Saved version', 16], ['status', 'Status', 34], ...refs],
    'Draft history': [...common, ['activity', 'Activity', 16], ...allAnswers, ['updated', 'Snapshot saved (SGT / UTC+08:00)', 28], ['version', 'Saved version', 16], ['status', 'Status', 34], ...refs],
    'Edit history': [['updated', 'Changed (SGT / UTC+08:00)', 28], ['action', 'Teacher action', 24], ['name', 'Student name', 28], ['home', 'Home group', 16], ['field', 'Field / question', 45], ['before', 'Before', 60], ['after', 'After', 60], ['actor', 'Changed by', 18], ...refs],
    Trash: [...common, ['activity', 'Activity', 16], ['revision', 'Student revision', 16], ...allAnswers, ...times, ...refs],
    'Long answers': [['name', 'Student name', 28], ['home', 'Home group', 16], ['field', 'Field / question', 45], ['part', 'Text part', 12], ['text', 'Full text — join parts in order', 100], ['sourceSheet', 'Original sheet', 22], ...refs],
    'Tinkercad mapping': [['home', 'Approved group', 16], ['name', 'Student-entered name', 28], ['accountLabel', 'Assigned account label (not login)', 36], ['accountReference', 'Account reference', 22], ['assigned', 'Assigned (SGT / UTC+08:00)', 28], ['updated', 'Approval updated (SGT / UTC+08:00)', 30], ['status', 'FIT access', 22], ['assignedName', 'Name at first assignment', 28], ['assignedGroup', 'Group at first assignment', 24], ['websiteSession', 'Website Session ID (not a login token)', 42, true], ...refs],
}
const sourceLabel = source => source === 'guest' ? 'Name and group entry' : 'Earlier account entry'
function base(record) { return { home: group(record.homeGroup), name: record.studentName, target: group(record.targetGroup), idea: record.idea, round: record.round, submitted: date(record.submittedAt), updated: date(record.updatedAt), status: status(record.status), source: sourceLabel(record.source), reference: record.reference, studentReference: record.studentReference } }
function flatten(value, prefix = '', result = new Map()) {
    if (Array.isArray(value)) { for (const [index, row] of value.entries()) flatten(row, prefix + 'Entry ' + (index + 1) + ' / ', result); return result }
    if (!value || typeof value !== 'object') return result
    for (const [key, content] of Object.entries(value)) {
        if (['reference', 'studentReference', 'source', 'type', 'projectVersion'].includes(key)) continue
        if (key === 'ideas') for (const idea of content) flatten(idea.answers, prefix + 'Idea ' + idea.idea + ' / ', result)
        else if (key === 'answers') flatten(content, prefix, result)
        else if (content !== null && typeof content !== 'object') result.set(prefix + (labels[key] || key), String(content))
    }
    return result
}
function* recordRows(record) {
    if (record.type === 'assignment') { yield { sheet: 'Tinkercad mapping', values: { ...base(record), accountLabel: record.accountLabel, accountReference: record.accountReference, websiteSession: record.websiteSession, assigned: date(record.assignedAt), updated: date(record.approvedAt), assignedName: record.assignedName, assignedGroup: group(record.assignedGroup) } }; return }
    if (record.type === 'feedback') { yield { sheet: record.status === 'deleted' ? 'Trash' : 'Feedback', values: { ...base(record), activity: 'Feedback', ...record.answers } }; return }
    if (record.type === 'refinement') { for (const idea of record.ideas) yield { sheet: record.status === 'deleted' ? 'Trash' : 'Improvements', values: { ...base(record), activity: 'Improvement', idea: idea.idea, revision: record.revision, ...idea.answers } }; return }
    if (record.type === 'draft') {
        const latest = record.snapshots.at(-1)
        yield { sheet: 'Drafts', values: { ...base(record), activity: record.activity, updated: date(record.updatedAt), version: record.version, ...(latest?.answers || {}) } }
        for (const snapshot of record.snapshots) yield { sheet: 'Draft history', values: { ...base(record), activity: record.activity, updated: date(snapshot.savedAt), version: snapshot.version, ...snapshot.answers, status: 'Retained autosave snapshot — not a submission' } }
        return
    }
    if (record.type === 'audit') {
        const before = flatten(record.before), after = flatten(record.after), keys = new Set([...before.keys(), ...after.keys()])
        const who = Array.isArray(record.after) ? record.after[0] : record.after?.studentName ? record.after : Array.isArray(record.before) ? record.before[0] : record.before
        let count = 0
        for (const key of keys) if (before.get(key) !== after.get(key)) { count++; yield { sheet: 'Edit history', values: { updated: date(record.at), action: record.action, name: who?.studentName || '', home: who?.homeGroup ? group(who.homeGroup) : '', field: key, before: before.get(key) || '', after: after.get(key) || '', actor: record.actor, source: sourceLabel(record.source), reference: record.reference } } }
        if (!count) yield { sheet: 'Edit history', values: { updated: date(record.at), action: record.action, field: 'Action recorded; no changed text', actor: record.actor, source: sourceLabel(record.source), reference: record.reference } }
    }
}

// Excel cannot store more than 32,767 UTF-16 code units in a cell. Keep the
// full string in archival JSONL and explicit ordered continuation rows.
function chunks(value, length) {
    const result = []; let start = 0
    while (start < value.length) { let end = Math.min(start + length, value.length); if (end < value.length && /[\uD800-\uDBFF]/.test(value[end - 1])) end--; result.push(value.slice(start, end)); start = end }
    return result
}
export function* backupRows(record) {
    for (const row of recordRows(record)) {
        const extra = []
        for (const [key, value] of Object.entries(row.values)) if (typeof value === 'string' && value.length > 32000) {
            const field = backupColumns[row.sheet].find(column => column[0] === key)?.[1] || key
            row.values[key] = 'Full text continues in Long answers: ' + field
            for (const [index, text] of chunks(value, 1000).entries()) extra.push({ sheet: 'Long answers', values: { name: row.values.name || '', home: row.values.home || '', field, part: index + 1, text, sourceSheet: row.sheet, source: row.values.source, reference: row.values.reference, studentReference: row.values.studentReference } })
        }
        yield row; yield* extra
    }
}
const sumHash = content => createHash('sha256').update(content).digest('hex')
const textForExcel = value => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, char => '[U+' + char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0') + ']') : value
const timeFormat = 'yyyy-mm-dd hh:mm:ss "SGT"'
function header(sheet) { const row = sheet.getRow(1); row.height = 46; row.eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF265B74' } }; cell.alignment = { vertical: 'middle', wrapText: true } }); row.commit() }

function appendedEntry(archive, name, signal) {
    return new Promise((resolve, reject) => {
        const cleanup = () => { archive.removeListener('entry', entered); signal.removeEventListener('abort', canceled) }
        const entered = entry => { if (entry.name === name) { cleanup(); resolve() } }
        const canceled = () => { cleanup(); reject(signal.reason || Error('Backup canceled')) }
        archive.on('entry', entered); signal.addEventListener('abort', canceled, { once: true })
        if (signal.aborted) canceled()
    })
}

async function writeWorkbook(archive, rows, metadata, part, signal) {
    const name = 'Excel/FIT-workshop-part-' + String(part).padStart(3, '0') + '.xlsx', digest = createHash('sha256'); let bytes = 0
    const output = new Transform({ transform(chunk, encoding, done) { bytes += chunk.length; digest.update(chunk); done(null, chunk) } })
    const cancel = () => output.destroy(signal.reason || Error('Backup canceled'))
    output.on('error', () => {})
    signal.addEventListener('abort', cancel, { once: true })
    const appended = appendedEntry(archive, name, signal)
    appended.catch(() => {})
    archive.append(output, { name, store: true })
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: output, useStyles: true, useSharedStrings: false })
    workbook.creator = 'FIT'; workbook.created = new Date(metadata.capturedAt)
    const overview = workbook.addWorksheet('Overview', { views: [{ state: 'frozen', ySplit: 1 }] })
    overview.columns = [{ header: 'FIT workshop backup', width: 38 }, { header: 'Snapshot details', width: 110 }]; header(overview)
    const counts = Object.fromEntries(Object.keys(backupColumns).map(sheet => [sheet, rows.filter(row => row.sheet === sheet).length]))
    const facts = [['Workshop', metadata.session], ['Captured (SGT / UTC+08:00)', date(metadata.capturedAt)], ['Workbook part', part], ['All submitted feedback', metadata.expected.feedback], ['All submitted improvements (contributions)', metadata.expected.refinement], ['All records in Trash', metadata.expected.trash], ['All autosaved drafts', metadata.expected.draft], ['All retained draft snapshots', metadata.expected.draftSnapshots], ['All teacher audit events', metadata.expected.audit], ['All assigned Tinkercad accounts', metadata.expected.assignment || 0], ...Object.entries(counts).map(([sheet, count]) => ['Rows in this part: ' + sheet, count]), ...metadata.notes.map((note, index) => ['Note ' + (index + 1), note]), ['Long answers', 'Text beyond the Excel cell limit is retained in ordered Long answers rows and unmodified archival JSONL.'], ['Unsupported control characters', 'Excel-incompatible control characters are shown as [U+XXXX]; original text is preserved in archival JSONL.'], ['Verification', 'manifest.json lists exact per-file SHA256 hashes, row counts and complete-record counts.']]
    for (const values of facts) { const row = overview.addRow(values); row.height = 38; row.eachCell(cell => { cell.alignment = { wrapText: true, vertical: 'top' }; if (cell.value instanceof Date) cell.numFmt = timeFormat }); row.commit() } overview.commit()
    for (const [name, columns] of Object.entries(backupColumns)) {
        const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1, xSplit: name === 'Edit history' ? 1 : 2 }] })
        sheet.columns = columns.map(([key, label, width, hidden]) => ({ key, header: label, width, hidden: Boolean(hidden) })); header(sheet)
        let count = 0
        for (const entry of rows) if (entry.sheet === name) {
            const values = Object.fromEntries(columns.map(([key]) => [key, textForExcel(entry.values[key] ?? '')])), row = sheet.addRow(values)
            row.height = Math.min(400, Math.max(30, ...columns.filter(column => !column[3]).map(([key, , width]) => { const value = values[key]; return typeof value === 'string' ? value.split('\n').reduce((lines, line) => lines + Math.max(1, Math.ceil(line.length / Math.max(10, width - 4))), 0) * 15 + 10 : 30 })))
            row.eachCell(cell => { cell.font = { name: 'Calibri', size: 11 }; cell.alignment = { wrapText: true, vertical: 'top' }; if (cell.value instanceof Date) cell.numFmt = timeFormat; if (count % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F7' } } })
            row.commit(); count++
        }
        sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: count + 1, column: columns.length } }; sheet.commit()
    }
    try { await Promise.all([workbook.commit(), appended]) }
    finally { signal.removeEventListener('abort', cancel) }
    return { name, bytes, sha256: digest.digest('hex'), sheetRows: counts, dataRows: rows.length }
}

export function createBackupArchive(snapshot, { maxRowsPerPart = 5000, maxTextBytesPerPart = 8 * 1024 * 1024, archiveRecordsPerPart = 500, signal, onError = () => {}, onComplete = () => {} } = {}) {
    const archive = archiver('zip', { zlib: { level: 6 }, forceZip64: true, highWaterMark: 64 * 1024 }), output = new PassThrough(), files = [], actual = { feedback: 0, refinement: 0, trash: 0, audit: 0, draft: 0, draftSnapshots: 0, assignment: 0 }
    let failed = false
    const cancellation = new AbortController()
    const fail = error => { if (failed) return; failed = true; cancellation.abort(error); archive.abort(); output.destroy(error); onError(error) }
    output.once('close', () => { if (!output.writableFinished) fail(Error('Backup canceled')) })
    archive.on('error', fail); archive.pipe(output)
    const abort = () => fail(Error('Backup canceled')); signal?.addEventListener('abort', abort, { once: true })
    const done = (async () => {
        let rows = [], rowBytes = 0, lines = [], lineBytes = 0, part = 0, archivePart = 0
        // Wait until each entry has drained into the outer ZIP before queuing
        // another one. A slow browser must not queue every JSONL part in RAM.
        const addFile = async (name, content, extra = {}) => { const bytes = Buffer.from(content, 'utf8'), appended = appendedEntry(archive, name, cancellation.signal); archive.append(bytes, { name }); await appended; files.push({ name, bytes: bytes.length, sha256: sumHash(bytes), ...extra }) }
        const flushRows = async () => { if (!rows.length && part) return; files.push(await writeWorkbook(archive, rows, snapshot.metadata, ++part, cancellation.signal)); rows = []; rowBytes = 0 }
        const flushRecords = async () => { if (!lines.length) return; await addFile('Archive/records-' + String(++archivePart).padStart(3, '0') + '.jsonl', lines.join(''), { records: lines.length }); lines = []; lineBytes = 0 }
        try {
            for await (const record of snapshot.records) {
                if (signal?.aborted || failed) throw Error('Backup canceled')
                actual[record.status === 'deleted' ? 'trash' : record.type]++
                if (record.type === 'draft') actual.draftSnapshots += record.snapshots.length
                const serialized = JSON.stringify(record) + '\n', bytes = Buffer.byteLength(serialized)
                if (lines.length && (lines.length >= archiveRecordsPerPart || lineBytes + bytes > maxTextBytesPerPart)) await flushRecords()
                lines.push(serialized); lineBytes += bytes
                for (const row of backupRows(record)) {
                    const size = Buffer.byteLength(JSON.stringify(row))
                    if (rows.length && (rows.length >= maxRowsPerPart || rowBytes + size > maxTextBytesPerPart)) await flushRows()
                    rows.push(row); rowBytes += size
                }
            }
            await flushRows(); await flushRecords()
            for (const [key, value] of Object.entries(snapshot.metadata.expected)) if (actual[key] !== value) throw Error('Backup count verification failed')
            await addFile('README.txt', 'FIT workshop Excel backup\r\n\r\nOpen every numbered workbook in the Excel folder. Each has an Overview and separate Feedback, Improvements, Drafts, Draft history, Edit history, Trash, Long answers and Tinkercad mapping tabs.\r\n\r\nAll timestamps in Excel are Singapore time (SGT / UTC+08:00). Archival JSONL retains exact UTC timestamps and original text. Technical references are hidden columns, not login credentials.\r\n\r\n' + snapshot.metadata.notes.join('\r\n') + '\r\n\r\nThis is a point-in-time copy. Download another copy after class for subsequent responses. Server data has not been deleted.\r\n')
            const manifest = { ...snapshot.metadata, complete: true, actual, files, workbookParts: part, archiveParts: archivePart, fullTextArchive: true, credentialsIncluded: false }
            archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' })
            await archive.finalize(); onComplete(manifest); return manifest
        } catch (error) { fail(error); throw error }
        finally { signal?.removeEventListener('abort', abort) }
    })()
    // The response consumer observes a failed stream; also handle the producer
    // promise immediately so a disconnected browser cannot leave a rejection.
    done.catch(() => {})
    return { stream: output, done, cancel: abort }
}
