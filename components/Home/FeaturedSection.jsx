'use client'
import { useEffect, useState } from 'react';
import ButtonLink from '../Buttons/ButtonLink';
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
    <div className='section'>
      <div className='flex flex-col md:flex-row w-full gap-20'>
        <div className='flex flex-col gap-8 w-full md:w-[40%] mt-4'>
          <div className='flex flex-col gap-2'>
            <h3>Featured</h3>
            <h1>
              Popular Prints
            </h1>
          </div>
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
                <div key={index} className='flex flex-col w-[400px] aspect-square not-last-of-type:p-4'>
                  <Image src={item.imageUrl} alt={item.name} className='w-full h-48 object-cover rounded-md mb-4' />
                  <h2 className='text-lg font-semibold'>{item.name}</h2>
                  <p className='text-sm '>{item.description}</p>
                  <span className='text-xl font-bold mt-2'>${item.price}</span>
                </div>
              )) : (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className='flex w-[400px] aspect-square bg-borderColor' />
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
  )
}

export default FeaturedSection