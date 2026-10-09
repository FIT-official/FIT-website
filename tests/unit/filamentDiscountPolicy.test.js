// @vitest-environment node
import { expect, it } from 'vitest'
import { getDiscountedPrice, discountRulesForProduct } from '@/utils/discount'
import { calculateCartItemBreakdown } from '@/app/api/checkout/calculateBreakdown'
import { cataloguePrice } from '@/lib/productCatalogue'
const product=name=>({_id:'111111111111111111111111',productType:'shop',categoryId:'Filament',name,basePrice:{presentmentAmount:10,presentmentCurrency:'SGD'},price:{presentmentAmount:10},discount:{percentage:50},delivery:{deliveryTypes:[{type:'collection',fee:0}]}})
it.each(['Bambu Lab PLA Filament','Bambu Labs PETG Filament','Bambu-Lab PLA filament'])('blocks all Bambu discount sources for %s',name=>{const p=product(name);p.discounts=[{tiers:[{minQty:1,percentage:99}]}];expect(getDiscountedPrice(p,100,[{percentage:99}])).toBeNull();expect(discountRulesForProduct(p,[{percentage:99}])).toEqual([]);expect(cataloguePrice(p)).toBe(10)})
it('uses only existing product-specific Lanbo rules, with no inferred global or quantity discount',()=>{const p=product('Lanbo PLA Filament');expect(getDiscountedPrice(p,100,[{percentage:50}])).toBe(5);delete p.discount;expect(getDiscountedPrice(p,100,[{percentage:50}])).toBeNull()})
it('does not change unrelated electronics or printing discounts',()=>{for(const p of [{...product('Bambu Lab printer'),categoryId:'Electronics'},{...product('Custom filament print'),productType:'print'}])expect(getDiscountedPrice(p,1,[{percentage:10}])).toBe(4)})
it('keeps Bambu server totals undiscounted within a mixed order with a discounted Lanbo fixture',async()=>{const rows=await Promise.all(['Lanbo PLA Filament','Bambu Lab PLA Filament','Bambu Lab PETG Filament'].map(name=>calculateCartItemBreakdown({product:product(name),item:{quantity:3,chosenDeliveryType:'collection'},extraDiscountRules:[{percentage:25}]})));expect(rows.map(r=>r.price)).toEqual([5,10,10]);expect(rows.map(r=>r.total)).toEqual([15,30,30])})
