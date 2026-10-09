import { randomUUID } from 'node:crypto'
const clone = value => value == null ? value : structuredClone(value)
const comparable = value => value instanceof Date ? value.getTime() : value
function matches(row, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some(part => matches(row, part))
    if (value && typeof value === 'object' && !(value instanceof Date)) return Object.entries(value).every(([operator, expected]) => operator === '$lt' ? comparable(row[key]) < comparable(expected) : operator === '$ne' ? row[key] !== expected : operator === '$in' ? expected.includes(row[key]) : false)
    return comparable(row[key]) === comparable(value)
  })
}
export function memoryCollection(uniqueKeys) {
  const rows = []
  return {
    rows,
    async findOne(filter) { return clone(rows.find(row => matches(row, filter)) || null) },
    async insertOne(row) {
      if (uniqueKeys.some(keys => rows.some(saved => keys.every(key => saved[key] === row[key])))) throw Object.assign(new Error('duplicate'), { code: 11000 })
      rows.push(clone({ ...row, _id: randomUUID() })); return { acknowledged: true }
    },
    find(filter) {
      let result = rows.filter(row => matches(row, filter))
      const cursor = {
        sort(order) { result.sort((a,b) => { for (const [field, direction] of Object.entries(order)) { const av = comparable(a[field]), bv = comparable(b[field]); if (av !== bv) return (av < bv ? -1 : 1) * direction } return 0 }); return cursor },
        limit(count) { result = result.slice(0,count); return cursor },
        async toArray() { return clone(result) },
      }
      return cursor
    },
    async findOneAndUpdate(filter, update) {
      const row = rows.find(item => matches(item, filter)); if (!row) return null
      Object.assign(row, clone(update.$set || {}))
      for (const [key, value] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + value
      for (const [key, value] of Object.entries(update.$push || {})) row[key] = [...(row[key] || []), ...clone(value.$each)].slice(value.$slice)
      return clone(row)
    },
  }
}
export const communityPost = overrides => ({ clientRequestId: randomUUID(), kind: 'question', topic: '3d-printing', title: 'Why does my test print lift?', displayName: 'Test maker', body: 'A synthetic test print lifts at one corner. What should I check first?', guidelinesAccepted: true, website: '', ...overrides })
export const communityComment = overrides => ({ clientRequestId: randomUUID(), displayName: 'Reply maker', body: 'Check the printer manufacturer guidance for the correct plate preparation.', guidelinesAccepted: true, website: '', ...overrides })
