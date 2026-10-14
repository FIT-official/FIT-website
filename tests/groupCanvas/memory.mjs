const clone = v => v === undefined ? undefined : structuredClone(v)
const get = (o, path) => path.split('.').reduce((v, p) => v?.[p], o)
function matches(row, query) {
  return Object.entries(query).every(([key, value]) => {
    if (key === '$or') return value.some(q => matches(row, q))
    const actual = get(row, key)
    if (value && typeof value === 'object') {
      if ('$in' in value) return value.$in.includes(actual)
      if ('$lt' in value) return actual < value.$lt
      if ('$elemMatch' in value) return actual?.some(r => matches(r, value.$elemMatch))
    }
    return actual === value
  })
}
// Test-only, deliberately absent from all production imports.
export function memoryDb() {
  const tables = new Map()
  const db = {
    transactional: true,
    collection(name) {
      if (!tables.has(name)) tables.set(name, new Map())
      const rows = tables.get(name)
      return {
        find(query) { let limit = Infinity; return { limit(n) { limit = n; return this }, async toArray() { return [...rows.values()].filter(r => matches(r, query)).slice(0, limit).map(clone) } } },
        async findOne(query) { return clone([...rows.values()].find(r => matches(r, query))) || null },
        async insertOne(row) { if (rows.has(row._id)) throw Object.assign(Error('duplicate'), { code: 11000 }); rows.set(row._id, clone(row)); return { insertedId: row._id } },
        async replaceOne(query, row) { const current = [...rows.values()].find(r => matches(r, query)); if (!current) return { modifiedCount: 0 }; rows.set(row._id, clone(row)); return { modifiedCount: 1 } },
        async updateOne(query, update, options = {}) {
          let row = [...rows.values()].find(r => matches(r, query))
          if (!row && options.upsert) { row = { ...query, ...clone(update.$setOnInsert) }; rows.set(row._id, row) }
          if (!row) return { modifiedCount: 0 }
          for (const [key, n] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + n
          for (const [key, v] of Object.entries(update.$set || {})) row[key] = clone(v)
          return { modifiedCount: 1 }
        },
      }
    },
  }
  return db
}
