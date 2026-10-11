import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ShopPage from '@/app/shop/ShopPage'
vi.mock('@/utils/useContent', () => ({useContent:()=>({content:{}})}))
vi.mock('@/utils/useInventoryRefresh', () => ({useInventoryRefresh:()=>{}}))
vi.mock('next/navigation', () => ({useRouter:()=>({refresh(){}}),useSearchParams:()=>new URLSearchParams()}))
vi.mock('@/components/ProductCard', () => ({default:({product})=><div data-testid="product">{product.name}</div>}))
const products=[{_id:'a',name:'Costly spool',basePrice:{presentmentAmount:50}},{_id:'b',name:'Low cost spool',basePrice:{presentmentAmount:10}}]
afterEach(cleanup)
it('offers named search and price controls and keyboard sorting',async()=>{
 const user=userEvent.setup();render(<ShopPage initialProducts={products}/>);
 expect(screen.getByRole('searchbox',{name:'Search products'})).toBeInTheDocument();
 const trigger=screen.getByRole('button',{name:'Filter',exact:true});trigger.focus();await user.keyboard('{Enter}');
 expect(trigger).toHaveAttribute('aria-expanded','true');
 const low=screen.getByRole('button',{name:'Price: Low to High',exact:true});low.focus();await user.keyboard('{Enter}');
 expect(screen.getAllByTestId('product').map(x=>x.textContent)).toEqual(['Low cost spool','Costly spool']);
 expect(trigger).toHaveAttribute('aria-expanded','false');
 await user.click(trigger);expect(screen.getByRole('slider',{name:'Maximum price'})).toBeInTheDocument();
 await user.keyboard('{Escape}');expect(trigger).toHaveAttribute('aria-expanded','false');expect(trigger).toHaveFocus();
})
it('clears a trimmed search and price cap together to recover from no matches',async()=>{
 const user=userEvent.setup();render(<ShopPage initialProducts={products}/>);
 await user.type(screen.getByRole('searchbox',{name:'Search products'}),'  Costly spool  ');
 expect(screen.getAllByTestId('product')).toHaveLength(1);
 await user.click(screen.getByRole('button',{name:'Filter',exact:true}));
 fireEvent.change(screen.getByRole('slider',{name:'Maximum price'}),{target:{value:'0'}});
 expect(screen.getByText('No products found.')).toBeInTheDocument();
 const recovery = screen.getByRole('button',{name:'Clear search and price filter'});
 expect(recovery.closest('#shop-filters')).not.toBeNull();
 await user.click(recovery);
 expect(screen.getByRole('button',{name:'Filter',exact:true})).toHaveAttribute('aria-expanded','false');
 expect(screen.getByRole('button',{name:'Filter',exact:true})).toHaveFocus();
 expect(screen.getAllByTestId('product')).toHaveLength(2);
 expect(screen.getByRole('searchbox',{name:'Search products'})).toHaveValue('');
})

it('offers a clear action outside the closed filter when a search has no matches',async()=>{
 const user=userEvent.setup();render(<ShopPage initialProducts={products}/>);
 await user.type(screen.getByRole('searchbox',{name:'Search products'}),'missing product');
 const recovery=screen.getByRole('button',{name:'Clear search and price filter'});
 expect(recovery.closest('#shop-filters')).toBeNull();await user.click(recovery);
 expect(screen.getAllByTestId('product')).toHaveLength(2);
})
