import { describe, expect, it } from 'vitest'
import { productVariantLabel, productVariantOptionLabel } from '../lib/productVariantLabel'
const product={slug:'bambu-lab-3d-printing-filament-1kg-pla-basic'}
describe('legacy PLA Basic display labels',()=>{
  it('limits the Cocoa Brown correction to the verified product and exact manufacturer code',()=>{
    expect(productVariantOptionLabel(product,{name:'Coca Brown (10802)'})).toBe('Cocoa Brown (10802)')
    expect(productVariantOptionLabel({slug:'another-product'},{name:'Coca Brown (10802)'})).toBe('Coca Brown (10802)')
    expect(productVariantOptionLabel(product,{name:'Coca Brown (99999)'})).toBe('Coca Brown (99999)')
  })
  it('supports persisted summary identity without rewriting it or matching other products',()=>{
    const summary={productId:'6974d555afadda8ec64083c3'}
    const option={name:'Coca Brown (10802)',additionalFee:0}
    const before=JSON.stringify([summary,option])
    expect(productVariantOptionLabel(summary,option)).toBe('Cocoa Brown (10802)')
    expect(productVariantOptionLabel({_id:summary.productId},option)).toBe('Cocoa Brown (10802)')
    expect(productVariantOptionLabel({productId:'another-product'},option)).toBe(option.name)
    expect(productVariantOptionLabel({...summary,slug:'another-material'},option)).toBe(option.name)
    expect(productVariantOptionLabel(summary,{name:'Without Spool'})).toBe('Without Spool')
    expect(JSON.stringify([summary,option])).toBe(before)
  })
  it('corrects the verified swapped groups without modifying stored keys or fees',()=>{
    const colours={name:'Spool',options:[{name:'Jade White (10100)',additionalFee:0},{name:'Black (10101)',additionalFee:0}]}
    const packs={name:'Colour',options:[{name:'With Spool',additionalFee:4},{name:'Without Spool',additionalFee:0}]}
    const before=JSON.stringify([colours,packs])
    expect(productVariantLabel(product,colours)).toBe('Colour')
    expect(productVariantLabel(product,packs)).toBe('Spool')
    expect(JSON.stringify([colours,packs])).toBe(before)
  })
  it('leaves corrected groups, ambiguous options and unrelated products untouched',()=>{
    const type={name:'Spool',options:[{name:'With Spool'}]}
    expect(productVariantLabel(product,type)).toBe('Spool')
    expect(productVariantLabel(product,{name:'Spool',options:[]})).toBe('Spool')
    expect(productVariantLabel(product,{name:'Spool',options:[{name:'Other'}]})).toBe('Spool')
    expect(productVariantLabel({slug:'another-product'},{name:'Spool',options:[{name:'Black (10101)'}]})).toBe('Spool')
  })
})
