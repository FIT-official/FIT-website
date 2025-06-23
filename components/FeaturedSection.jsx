'use client'
import { useEffect, useState } from 'react';
import ButtonLink from './Buttons/ButtonLink'
import { GoChevronLeft, GoChevronRight } from 'react-icons/go'

function FeaturedSection() {
  const [maxItems, setMaxItems] = useState(5);
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);

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
        console.error('Error fetching popular prints:', error);
      }
    }
    fetchPopularPrints();
  }, []);

  return (
    <div className='flex w-full min-h-[75vh] py-20 items-center justify-center px-12 md:px-24'>
      <div className='flex flex-col md:flex-row w-full gap-20'>
        <div className='flex flex-col gap-8 w-full md:w-[40%]'>
          <h1>
            Popular Prints
          </h1>
          <p className='w-full text-pretty flex'>
            Lorem ipsum dolor sit amet consectetur, adipisicing elit. Quam eum commodi libero, dicta illum ducimus natus. Tenetur, velit eveniet inventore voluptatum magnam perspiciatis perferendis nostrum accusantium consectetur provident quidem nam.
          </p>
          <ButtonLink lnk={'/prints'} text={'Browse More'} />
        </div>
        <div className='flex flex-col md:w-[60%] gap-6 w-full'>
          <div className='flex w-full overflow-x-hidden relative h-[400px]'>
            <div
              className="absolute flex gap-5 transition-transform duration-500 ease-in-out h-full"
              style={{ transform: `translateX(${idx * -420}px)` }}
            >
              {items.length > 0 ? items.map((item, index) => (
                <div key={index} className='flex flex-col w-[400px] aspect-square bg-gray-200 p-4'>
                  <Image src={item.imageUrl} alt={item.name} className='w-full h-48 object-cover rounded-md mb-4' />
                  <h2 className='text-lg font-semibold'>{item.name}</h2>
                  <p className='text-sm text-gray-600'>{item.description}</p>
                  <span className='text-xl font-bold mt-2'>${item.price}</span>
                </div>
              )) : (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className='flex w-[400px]  aspect-square bg-borderColor' />
                ))
              )}
            </div>
          </div>
          <div className='flex gap-4 w-full md:justify-end flex-row justify-between items-center'>
            <button onClick={prevItem} className='cursor-pointer'>
              <GoChevronLeft size={20} />
            </button>
            <button onClick={nextItem} className='cursor-pointer'>
              <GoChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FeaturedSection