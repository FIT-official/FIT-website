const compare = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
export const groupName = group => /^g\d+$/.test(group || '') ? `Group ${group.slice(1)}` : 'Unassigned group'

export function teacherWork(lesson) {
    const accounts = new Map((lesson.accounts || []).map(account => [account._id, account]))
    const rows = [
        ...(lesson.feedback || []).map(row => ({ ...row, kind: 'feedback', source: row.visitingGroup, target: row.presentingGroup })),
        ...(lesson.refinements || []).map(row => ({ ...row, kind: 'refinement', source: row.group, target: row.group })),
    ].map(row => ({
        ...row,
        visibility: row.visibility || 'visible',
        name: row.studentName?.trim() || accounts.get(row.seat)?.studentName?.trim() || accounts.get(row.seat)?.name?.trim() || 'Name unavailable',
        // Identity stays attached to the saved session, never to a self-reported name.
        author: JSON.stringify([row.source, row.seat || row.kind + ':' + row.id]),
    }))
    const authors = new Map()
    for (const row of rows) {
        if (!authors.has(row.author)) authors.set(row.author, row)
    }
    const names = new Map()
    for (const row of [...authors.values()].sort((a, b) => compare(a.author, b.author))) {
        const key = JSON.stringify([row.source, row.name.toLocaleLowerCase()])
        const matches = names.get(key) || []
        matches.push(row.author)
        names.set(key, matches)
    }
    return rows.map(row => {
        const matches = names.get(JSON.stringify([row.source, row.name.toLocaleLowerCase()])) || [row.author]
        return { ...row, nameLabel: matches.length > 1 ? `${row.name} (${matches.indexOf(row.author) + 1})` : row.name }
    }).sort((a, b) => (Date.parse(b.recordedAt) || 0) - (Date.parse(a.recordedAt) || 0) || compare(a.id, b.id))
}

export function groupTeacherWork(rows, { groupBy = 'source', group = 'all', search = '', status = 'all', type = 'all' } = {}) {
    const query = search.trim().toLocaleLowerCase()
    const filtered = rows.filter(row => {
        const content = [row.name, groupName(row.source), groupName(row.target), row.whatWorks, row.question, row.improvement,
            ...(row.ideas || []).flatMap(idea => [idea.feedbackUsed, idea.change, idea.reason, idea.test])].join(' ').toLocaleLowerCase()
        return (group === 'all' || row[groupBy] === group) && (status === 'all' || row.visibility === status)
            && (type === 'all' || row.kind === type) && (!query || content.includes(query))
    })
    const groups = new Map()
    for (const row of filtered) {
        const id = row[groupBy] || 'unassigned'
        if (!groups.has(id)) groups.set(id, { id, students: new Map(), count: 0 })
        const section = groups.get(id)
        if (!section.students.has(row.author)) section.students.set(row.author, { key: row.author, name: row.nameLabel, group: row.source, rows: [] })
        section.students.get(row.author).rows.push(row)
        section.count++
    }
    return [...groups.values()].sort((a, b) => compare(a.id, b.id)).map(section => ({
        ...section,
        students: [...section.students.values()].sort((a, b) => compare(a.name, b.name) || compare(a.key, b.key)),
    }))
}
