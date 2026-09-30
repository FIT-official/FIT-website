import { describe, expect, it } from 'vitest'
import { productVariantLabel } from '../lib/productVariantLabel'
const product={slug:'bambu-lab-3d-printing-filament-1kg-pla-basic'}
describe('legacy PLA Basic display labels',()=>{
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
