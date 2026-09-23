// @vitest-environment node
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { parse3mfToPositions } from '@/lib/quoting/threeMf'
import { meshVolume } from '@/lib/quoting/geometryVolume'

const mesh = `<object id="1"><mesh><vertices>
 <vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/>
 <vertex x="0" y="10" z="0"/><vertex x="0" y="0" z="10"/>
 </vertices><triangles><triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3"/>
 <triangle v1="0" v2="3" v3="2"/><triangle v1="1" v2="2" v3="3"/>
 </triangles></mesh></object>`
const xml = (objects = mesh, items = '<item objectid="1"/>', attributes = 'unit="millimeter"') =>
  `<model ${attributes}><resources>${objects}</resources><build>${items}</build></model>`
async function bytes(xml, secondPart) {
  const zip = new JSZip().file('3D/3dmodel.model', xml)
  if (secondPart) zip.file('3D/second.model', secondPart)
  return zip.generateAsync({ type: 'uint8array' })
}

describe('3MF complete-geometry verification', () => {
  it('preserves a valid mesh, single-quoted XML and repeated valid components', async () => {
    const positions = await parse3mfToPositions(await bytes(xml().replace(/"/g, "'")))
    expect(meshVolume(positions)).toBeCloseTo(1000 / 6, 5)
    const assembly = mesh + '<object id="2"><components><component objectid="1"/><component objectid="1" transform="1 0 0 0 1 0 0 0 1 20 0 0"/></components></object>'
    const assembled = await parse3mfToPositions(await bytes(xml(assembly, '<item objectid="2"/>')))
    expect(meshVolume(assembled)).toBeCloseTo(2000 / 6, 5)
  })
  it.each([
    ['missing vertex coordinate', source => source.replace('x="10"', '')],
    ['nonfinite vertex', source => source.replace('x="10"', 'x="Infinity"')],
    ['numeric prefix junk', source => source.replace('x="10"', 'x="10oops"')],
    ['out-of-range triangle', source => source.replace('v1="0"', 'v1="999"')],
    ['fractional triangle', source => source.replace('v1="0"', 'v1="0.1"')],
    ['negative triangle', source => source.replace('v1="0"', 'v1="-1"')],
    ['unknown unit', source => source.replace('millimeter', 'furlong')],
    ['invalid transform', source => source.replace('<item objectid="1"/>', '<item objectid="1" transform="2 0 0"/>')],
    ['unsupported required extension', source => source.replace('<model ', '<model requiredextensions="production" ')],
    ['missing build section', source => source.replace(/<build>.*?<\/build>/, '')],
    ['empty build section', source => source.replace('<item objectid="1"/>', '')],
    ['nonprintable build part', source => source.replace('<item objectid="1"/>', '<item objectid="1" printable="false"/>')],
    ['missing build reference after valid mesh', source => source.replace('</build>', '<item objectid="42"/></build>')],
    ['duplicate object id', source => source.replace('</resources>', mesh + '</resources>')],
  ])('fails closed for %s', async (_name, mutate) => {
    expect(await parse3mfToPositions(await bytes(mutate(xml())))).toBeNull()
  })
  it('rejects missing, cyclic and cross-file assembly references without pricing a valid prefix', async () => {
    for (const component of ['objectid="42"', 'objectid="2"', 'objectid="1" p:path="/3D/second.model"']) {
      const objects = mesh + `<object id="2"><components><component ${component}/></components></object>`
      expect(await parse3mfToPositions(await bytes(xml(objects, '<item objectid="1"/><item objectid="2"/>')))).toBeNull()
    }
  })
  it('refuses multiple model parts instead of measuring only the first', async () => {
    expect(await parse3mfToPositions(await bytes(xml(), xml()))).toBeNull()
  })
})
