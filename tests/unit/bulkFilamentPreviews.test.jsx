import liveIdentities from '../fixtures/bulkColourIdentities-2026-10-09.json'
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import evidence from '@/lib/bulkFilamentPreviews.json'
import { bulkColourPreview, bulkSheetColourPreview } from '@/lib/bulkFilamentPreviews'
import FilamentColourPreview from '@/components/Shop/FilamentColourPreview'
afterEach(cleanup)
it('hides the unavailable Wood photo without fetching or inventing a replacement', () => {
  const preview = bulkSheetColourPreview({ brand: 'Lanbo', material: 'PLA', colour: 'Wood Colour' })
  expect(preview).toMatchObject({ kind: 'unavailable', status: 'source_unavailable' })
  expect(preview).not.toHaveProperty('src')
  expect(preview).not.toHaveProperty('colours')
  const view = render(<FilamentColourPreview preview={preview} name="Wood Colour" />)
  expect(screen.getByText('Preview unavailable')).toBeInTheDocument()
  expect(view.container.querySelector('img')).toBeNull()
})
it('keeps all 111 original inventory identities with only verified display previews',()=>{
  expect(evidence.entries).toHaveLength(111)
  expect(new Set(evidence.entries.map(e=>e.productId+':'+e.optionId)).size).toBe(111)
  expect(evidence.entries.filter(e=>e.preview.kind==='image')).toHaveLength(41)
  expect(evidence.entries.filter(e=>e.preview.kind==='swatch')).toHaveLength(49)
  expect(evidence.entries.filter(e=>e.preview.kind==='unavailable')).toHaveLength(21)
  for(const e of evidence.entries){expect(bulkColourPreview({id:e.productId,slug:e.slug},{id:e.optionId,name:e.originalName})).toEqual(e.preview)}
})
it('fails closed for changed names, IDs, materials or products',()=>{
  const e=evidence.entries[0],p={id:e.productId,slug:e.slug},o={id:e.optionId,name:e.originalName}
  expect(bulkColourPreview({...p,slug:'other'},o)).toBeNull();expect(bulkColourPreview(p,{...o,name:'other'})).toBeNull();expect(bulkColourPreview(p,{...o,id:'other'})).toBeNull()
})
it('preserves all conflicting identities and original Cocoa display typo evidence',()=>{
  const conflicts=evidence.entries.filter(e=>e.preview.status==='name_code_conflict');expect(conflicts.map(e=>e.originalName)).toEqual(['Cotton Candy Cloud (10905)','Sky Blue (11601)','White (66400)']);expect(conflicts.every(e=>e.preview.kind==='unavailable'&&!e.preview.src&&!e.preview.colours)).toBe(true)
  const typo=evidence.entries.find(e=>e.originalName==='Coca Brown (10802)');expect(typo.preview.label).toBe('Cocoa Brown (10802)')
  expect(evidence.entries.find(e=>e.originalName==='Blue (10600)').preview.colours).toEqual(['#0A2989FF'])
})
it('provides named material-specific reference chips without inventing gradient direction',()=>{
  const preview=evidence.entries.find(e=>e.originalName==='Mint Lime (10904)').preview
  render(<FilamentColourPreview preview={preview} name="Mint Lime"/>);const image=screen.getByRole('img',{name:/PLA Basic Gradient Mint Lime.*reference pair/});expect(image.children).toHaveLength(2);expect(image.innerHTML).not.toContain('linear-gradient')
})
it('uses exact product images and changes failed photos to a neutral state',()=>{
  const preview=evidence.entries.find(e=>e.preview.kind==='image').preview
  render(<FilamentColourPreview preview={preview} name="Black"/>);const image=screen.getByRole('img',{name:/manufacturer product photo/});expect(image.getAttribute('src')).toBe(preview.src);fireEvent.error(image);expect(screen.getByText('Preview unavailable')).toBeInTheDocument()
})

it('explains every unavailable preview without substituting another colour',()=>{
  for(const e of evidence.entries.filter(e=>e.preview.kind==='unavailable')){
    expect(e.preview.reason.length).toBeGreaterThan(35)
    const view=render(<FilamentColourPreview preview={e.preview} name={e.originalName}/>);
    expect(screen.getByRole('img',{name:e.preview.label+': preview unavailable. '+e.preview.reason})).toBeInTheDocument();view.unmount()
  }
})

it('covers every one of the 111 live colour identities across 18 products without dropping FIT options',()=>{
  expect(liveIdentities.products).toHaveLength(18)
  const checked=liveIdentities.products.flatMap(product=>product.colours.map(option=>({product,option,preview:bulkColourPreview(product,option)})))
  expect(checked).toHaveLength(111);expect(checked.every(e=>e.preview)).toBe(true)
  expect(new Set(evidence.entries.map(e=>e.productId)).size).toBe(18)
  const fit=checked.filter(e=>e.product.slug.endsWith('-fit'))
  expect(fit).toHaveLength(5);expect(fit.every(e=>e.preview.kind==='unavailable'&&e.preview.reason.startsWith('No verified FIT '))).toBe(true)
})

it('keeps all preview data free of price and stock fields', () => {
  const walk = value => {
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      expect(key).not.toMatch(/price|stock|quantity|discount|tier|amount/i)
      walk(child)
    }
  }
  walk(evidence)
})
