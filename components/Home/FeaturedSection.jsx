'use client'
import { useEffect, useState } from 'react';
import ButtonLink from '../Buttons/ButtonLink';
import { GoChevronLeft, GoChevronRight } from 'react-icons/go'
import { useToast } from '../General/ToastProvider';
import ProductCard from '../ProductCard';
import { useContent } from '@/utils/useContent';
import MarkdownRenderer from '@/components/General/MarkdownRenderer';

function FeaturedSection() {
  const [maxItems, setMaxItems] = useState(5);
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const { showToast } = useToast();

  const { content: sectionContent } = useContent('home/featured-section', {
    title: 'Popular Prints',
    content: 'Discover amazing 3D printable designs from our community of creators.',
    productType: 'print',
    displayMode: 'category',
    category: 'Trending Prints',
    subcategory: 'Popular',
    customProducts: ''
  });

  const nextItem = () => {
    setIdx((prevIdx) => (prevIdx + 1) % maxItems);
  }

  const prevItem = () => {
    setIdx((prevIdx) => (prevIdx - 1 + maxItems) % maxItems);
  }

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const displayMode = sectionContent.displayMode || 'category'
        const productType = sectionContent.productType === 'shop' ? 'shop' : 'print'
        let response

        if (displayMode === 'custom' && sectionContent.customProducts) {
          // Fetch custom products by IDs
          const productIds = sectionContent.customProducts
            .split(',')
            .map(id => id.trim())
            .filter(id => id.length > 0)

          if (productIds.length === 0) {
            setItems([])
            setMaxItems(5)
            return
          }

          const products = []
          for (const productId of productIds.slice(0, 20)) {
            try {
              const res = await fetch(`/api/product/${productId}`)
              if (res.ok) {
                const product = await res.json()
                products.push(product)
              }
            } catch (err) {
              console.error(`Failed to fetch product ${productId}:`, err)
            }
          }

          setItems(products)
          if (products.length > 0) {
            setMaxItems(Math.min(products.length, 5))
          } else {
            setMaxItems(5)
          }
        } else {
          // Fetch by category/subcategory
          const category = sectionContent.category || 'Trending Prints'
          const subcategory = sectionContent.subcategory || 'Popular'

          const params = new URLSearchParams({
            productType,
            productCategory: category,
            limit: '20'
          })

          if (subcategory) {
            params.append('productSubCategory', subcategory)
          }

          response = await fetch(`/api/product?${params.toString()}`)

          if (!response.ok) {
            throw new Error('Network response was not ok')
          }

          const data = await response.json()
          setItems(data.products || [])
          if (data.products && data.products.length > 0) {
            setMaxItems(Math.min(data.products.length, 5))
          } else {
            setMaxItems(5)
          }
        }
      } catch (error) {
        showToast('Failed to fetch products: ' + error.message, 'error')
      }
    }

    fetchProducts()
  }, [sectionContent.displayMode, sectionContent.category, sectionContent.subcategory, sectionContent.customProducts, sectionContent.productType]);

  return (
    <div className='flex w-full py-20 items-center justify-center px-12 md:px-32 border-b border-borderColor min-h-[50vh]'>
      <div className='flex h-full flex-col lg:flex-row w-full gap-20'>
        <div className='flex flex-col gap-8 w-full h-full lg:w-[40%] mt-4'>
          <div className='flex flex-col gap-2'>
            <h3>Featured</h3>
            <h1>
              {sectionContent.title}
            </h1>
          </div>
          <MarkdownRenderer
            source={sectionContent.content}
            className='w-full text-pretty flex text-sm'
          />
          <ButtonLink lnk={'/prints'} text={'Browse More'} />
        </div>

        <div className='flex flex-col min-w-[255px] gap-6 w-full lg:w-[60%]'>
          <div className='flex flex-col gap-4'>
            <div className='flex  h-full overflow-x-hidden relative'>
              <div
                className="flex gap-5 transition-transform duration-500 ease-in-out"
                style={{ transform: `translateX(${idx * -275}px)` }}
              >
                {items.length > 0 ? items.slice(0, maxItems).map((item, index) => (
                  <div className='flex flex-col w-[255px] min-h-[255px]' key={index}>
                    <ProductCard product={item} />
                  </div>
                )) : (
                  Array.from({ length: maxItems }).map((_, i) => (
                    <div key={i} className='flex w-[255px] min-h-[255px] bg-borderColor' />
                  ))
                )}
              </div>
            </div>
            <div className='flex gap-4 w-full md:justify-end flex-row justify-between items-center'>
              <button onClick={prevItem} className='toggleXbutton'>
                <GoChevronLeft size={24} />
              </button>
              <button onClick={nextItem} className='toggleXbutton'>
                <GoChevronRight size={24} />
              </button>
            </div>

          </div>

        </div>
      </div>
    </div>
  )
}

export default FeaturedSection