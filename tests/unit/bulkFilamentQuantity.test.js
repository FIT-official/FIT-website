// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { bulkCatalogue, parseBulkInput, prepareBulkLines } from '@/lib/bulkFilament'
import { fixtureProduct, fixtureInput } from '../fixtures/bulkFilament'
function setup(){const product=fixtureProduct(),catalogue=bulkCatalogue([product]),input=fixtureInput(catalogue);input.lines[0]={...input.lines[0],quantity:25};delete input.lines[0].recordedQuantity;delete input.lines[0].extraQuantity;return {product,catalogue,input}}
const prepare=(input,catalogue)=>prepareBulkLines(parseBulkInput(input),catalogue)
describe('single total quantities',()=>{
  it('allows exact recorded stock plus twenty and preserves actual stock',()=>{const {product,catalogue,input}=setup();const before=structuredClone(product);expect(prepare(input,catalogue)[0]).toMatchObject({quantity:25,recordedQuantity:5,extraQuantity:20,recordedProductStock:12,publicLineTotal:{amount:250,currency:'SGD'}});expect(product).toEqual(before)})
  it.each([0,-1,1.5,'4',null,Infinity,1000021])('rejects invalid total %s',quantity=>{const {input}=setup();input.lines[0].quantity=quantity;expect(()=>parseBulkInput(input)).toThrow()})
  it('rejects a total beyond the current cap',()=>{const {input,catalogue}=setup();input.lines[0].quantity=26;expect(()=>prepare(input,catalogue)).toThrow('current availability')})
  it.each([0,2,10])('uses a fresh %s stock count, rejecting old snapshots',stock=>{const {product,input}=setup();product.variantTypes[0].options[0].stock=stock;product.variantTypes[1].options[0].stock=20;const fresh=bulkCatalogue([product]);expect(()=>prepare(input,fresh)).toThrow('changed');input.lines[0].version=fresh[0].version;input.lines[0].quantity=stock+20;expect(prepare(input,fresh)[0].quantity).toBe(stock+20);input.lines[0].quantity++;expect(()=>prepare(input,fresh)).toThrow('current availability')})
  it('aggregates repeated identical lines and spool choices instead of multiplying the allowance',()=>{for(const spool of [false,true]){const {input,catalogue}=setup();input.lines[0].quantity=15;const second=structuredClone(input.lines[0]);second.quantity=10;if(spool)second.options[1].optionId='777777777777777777777777';input.lines.push(second);expect(prepare(input,catalogue).reduce((n,l)=>n+l.quantity,0)).toBe(25);input.lines[1].quantity=11;expect(()=>prepare(input,catalogue)).toThrow('current availability')}})
  it('allows independent colours and assigns shared stock without letting a small line starve another colour',()=>{const {input,catalogue}=setup();input.lines[0].quantity=6;const second=structuredClone(input.lines[0]);second.options[0].optionId='444444444444444444444444';second.quantity=26;input.lines.push(second);const rows=prepare(input,catalogue);expect(rows.map(l=>l.quantity)).toEqual([6,26]);expect(rows.reduce((n,l)=>n+l.recordedQuantity,0)).toBe(6);expect(rows.every(l=>l.extraQuantity<=20)).toBe(true);input.lines[0].quantity=21;expect(()=>prepare(input,catalogue)).toThrow('current availability')})
  it('does not count unknown stock as verified availability',()=>{const {product,input}=setup();delete product.variantTypes[0].options[0].stock;const c=bulkCatalogue([product]);input.lines[0].version=c[0].version;input.lines[0].quantity=20;expect(prepare(input,c)[0].recordedQuantity).toBe(0);input.lines[0].quantity=21;expect(()=>prepare(input,c)).toThrow()})
  it('rejects mixed old and new quantity contracts',()=>{const {input}=setup();input.lines.push(fixtureInput(bulkCatalogue([fixtureProduct()])).lines[0]);expect(()=>parseBulkInput(input)).toThrow('one quantity format')})
})
it('puts actual Lanbo PLA first and PETG second without mutating source records',()=>{
  const raw=['other','1kg-petg-3d-printing-filament-lanbo','1kg-pla-3d-printing-filament-lanbo'].map((slug,i)=>({...fixtureProduct(),_id:String(i+1).repeat(24),slug,name:slug}))
  expect(bulkCatalogue(raw).map(p=>p.slug)).toEqual([raw[2].slug,raw[1].slug,raw[0].slug]);expect(raw[0].slug).toBe('other')
})
it('keeps Bambu at public price in mixed-brand, multi-colour and repeated lines despite forged discounts',()=>{
  const lanbo={...fixtureProduct(),name:'Lanbo PLA Filament',slug:'lanbo-pla-filament',discount:{percentage:99}}
  const bambu={...fixtureProduct(),_id:'aaaaaaaaaaaaaaaaaaaaaaaa',name:'Bambu Lab PLA Filament',slug:'bambu-lab-pla-filament',discounts:[{percentage:99}]}
  const catalogue=bulkCatalogue([lanbo,bambu]), input=fixtureInput(catalogue)
  input.coupon='FREE';input.discountPercentage=100
  input.lines=catalogue.flatMap(p=>[0,1,1].map(i=>({productId:p.id,version:p.version,options:p.types.map((t,j)=>({typeId:t.id,optionId:t.options[j===0?i:0].id})),quantity:2,price:0.01,discount:100,remarks:''})))
  const rows=prepare(input,catalogue);expect(rows).toHaveLength(6);expect(rows.every(l=>l.publicUnitPrice.amount===10&&l.publicLineTotal.amount===20)).toBe(true)
  expect(rows.filter(l=>l.productId===bambu._id).reduce((n,l)=>n+l.publicLineTotal.amount,0)).toBe(60)
})

it('rebalances earlier spool allocations so a valid mixed-colour request is not rejected',()=>{
  const {product,input}=setup();product.stock=20
  product.variantTypes.forEach(t=>t.options.forEach(o=>o.stock=10))
  const catalogue=bulkCatalogue([product]);input.lines[0].version=catalogue[0].version;input.lines[0].quantity=20
  const withSpool=structuredClone(input.lines[0]);withSpool.options[1].optionId='777777777777777777777777';withSpool.quantity=10
  const white=structuredClone(input.lines[0]);white.options[0].optionId='444444444444444444444444';white.quantity=30
  input.lines.push(withSpool,white)
  const rows=prepare(input,catalogue);expect(rows.reduce((n,l)=>n+l.quantity,0)).toBe(60)
  expect(rows.reduce((n,l)=>n+l.recordedQuantity,0)).toBe(20)
  expect(rows.filter(l=>l.colour==='Black').reduce((n,l)=>n+l.extraQuantity,0)).toBe(20)
})
