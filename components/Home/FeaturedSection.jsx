'use client'
import { useEffect, useState } from 'react';
import ButtonLink from '../Buttons/ButtonLink';
import { GoChevronLeft, GoChevronRight, GoStarFill } from 'react-icons/go'
import Image from 'next/image';
import { useToast } from '../General/ToastProvider';
import ProductCard from '../ProductCard';

function FeaturedSection() {
  const [maxItems, setMaxItems] = useState(5);
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const { showToast } = useToast();

  const nextItem = () => {
    setIdx((prevIdx) => (prevIdx + 1) % maxItems);
    console.log('Next item clicked');
  }

  const prevItem = () => {
    setIdx((prevIdx) => (prevIdx - 1 + maxItems) % maxItems);
    console.log('Previous item clicked');
  }

  useEffect(() => {
    const fetchPopularPrints = async () => {
      try {
        const response = await fetch('/api/product?productType=print&productCategory=Trending%20Prints&productSubCategory=Popular&limit=20')
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const data = await response.json();
        setItems(data.products || []);
        if (data.products && data.products.length > 0) {
          setMaxItems(Math.min(data.products.length, 5));
          console.log('Fetched items:', items);
        } else {
          setMaxItems(5);
          console.log('No items found, setting maxItems to 5');
        }
      } catch (error) {
        showToast('Failed to fetch popular prints: ' + error.message, 'error');
      }
    }
    fetchPopularPrints();
  }, []);

  return (
    <div className='flex w-full py-20 items-center justify-center px-12 md:px-32 border-b border-borderColor min-h-[50vh]'>
      <div className='flex h-full flex-col lg:flex-row w-full gap-20'>
        <div className='flex flex-col gap-8 w-full h-full lg:w-[40%] mt-4'>
          <div className='flex flex-col gap-2'>
            <h3>Featured</h3>
            <h1>
              Popular Prints
            </h1>
          </div>
          <p className='w-full text-pretty flex text-sm'>
            Lorem ipsum dolor sit amet consectetur, adipisicing elit. Quam eum commodi libero, dicta illum ducimus natus. Tenetur, velit eveniet inventore voluptatum magnam perspiciatis perferendis nostrum accusantium consectetur provident quidem nam.
          </p>
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