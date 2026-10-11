const clone = v => v == null ? v : structuredClone(v)
const get = (o, key) => key.split('.').reduce((v,k) => v?.[k], o)
const set = (o, key, v) => { const bits=key.split('.'), last=bits.pop(); for(const k of bits)o=o[k] ||= {};o[last]=clone(v) }
const equal = (a,b) => a instanceof Date || b instanceof Date ? +new Date(a) === +new Date(b) : a === b
const project = (row, p) => !p ? clone(row) : Object.fromEntries(Object.entries(row).filter(([k]) => p[k] === 1 || (k === '_id' && p._id !== 0)).map(([k,v])=>[k,clone(v)]))
function match(row, query) {
  return Object.entries(query).every(([key, expected]) => {
    if(key==='$or')return expected.some(q=>match(row,q))
    const actual=get(row,key)
    if(expected&&typeof expected==='object'&&!(expected instanceof Date))return Object.entries(expected).every(([op,v])=>{
      if(op==='$in')return v.includes(actual)
      if(op==='$lt')return actual<v
      if(op==='$lte')return actual<=v
      if(op==='$gt')return actual>v
      if(op==='$gte')return actual>=v
      if(op==='$exists')return (actual!==undefined)===v
      throw Error('Unsupported memory query '+op)
    })
    return equal(actual,expected)
  })
}
function modify(row, update, fresh=false){
  if(fresh)for(const [k,v]of Object.entries(update.$setOnInsert||{}))set(row,k,v)
  for(const[k,v]of Object.entries(update.$set||{}))set(row,k,v)
  for(const[k,v]of Object.entries(update.$inc||{}))set(row,k,(get(row,k)||0)+v)
  for(const[k,v]of Object.entries(update.$max||{}))if(get(row,k)==null||get(row,k)<v)set(row,k,v)
}
export function memoryDb(initial={}) {
  const stores = new Map()
  return { stores, collection(name){
    if(!stores.has(name)){
      const rows=clone(initial[name]||[])
      stores.set(name, { rows,
        async createIndex(){},
        async findOne(query, options={}){const r=rows.find(r=>match(r,query));return r?project(r,options.projection):null},
        async updateOne(query, update, options={}){
          let row=rows.find(r=>match(r,query));const fresh=!row
          if(!row&&!options.upsert)return{matchedCount:0,upsertedCount:0}
          if(!row){row=clone(query);rows.push(row)}
          modify(row,update,fresh);return{matchedCount:fresh?0:1,upsertedCount:fresh?1:0}
        },
        async findOneAndUpdate(query, update){const row=rows.find(r=>match(r,query));if(!row)return null;modify(row,update);return clone(row)},
        find(query={},options={}){
          let result=rows.filter(r=>match(r,query))
          const cursor={sort(keys){result.sort((a,b)=>{for(const[k,dir]of Object.entries(keys)){if(get(a,k)<get(b,k))return-dir;if(get(a,k)>get(b,k))return dir}return 0});return cursor},limit(n){result=result.slice(0,n);return cursor},async toArray(){return result.map(r=>project(r,options.projection))}}
          return cursor
        },
      })
    }
    return stores.get(name)
  } }
}
