'use client'
import Image from "next/image";
import { useEffect, useState, useRef } from "react";
import { GoChevronLeft, GoChevronRight } from "react-icons/go"
import Grid from "../General/Grid";
import { useContent } from '@/utils/useContent'

function Testimonials() {
    const { content } = useContent('home/testimonials', {
        testimonials: [
            {
                name: "J. Cedrick",
                role: "NTU MAE Student, Beginner",
                text: "Sent in a last-minute print for my project and got it back the next day, even did some post-processing work for free!",
                avatar: "/user.jpg"
            },
            {
                name: "C. Kenny",
                role: "Hobbyist",
                text: "FIT isn't just selling prints, they helped me build my 3D printer and sourced affordable parts for me!",
                avatar: "/user.jpg"
            }
        ]
    })

    const testimonials = content.testimonials || []
    const [maxItems, setMaxItems] = useState(testimonials.length);
    const [idx, setIdx] = useState(0);
    const [fade, setFade] = useState(true);
    const intervalRef = useRef(null);

    useEffect(() => {
        setMaxItems(testimonials.length)
    }, [testimonials])

    const showItem = (newIdx) => {
        setFade(false);
        setTimeout(() => {
            setIdx(newIdx);
            setTimeout(() => {
                setFade(true);
            }, 100);
        }, 600);
    };

    const nextItem = () => {
        showItem((idx + 1) % maxItems);
    }

    const prevItem = () => {
        showItem((idx - 1 + maxItems) % maxItems);
    }

    useEffect(() => {
        intervalRef.current = setInterval(() => {
            showItem((prevIdx) => (typeof prevIdx === "number" ? (prevIdx + 1) % maxItems : (idx + 1) % maxItems));
        }, 5000);
        return () => clearInterval(intervalRef.current);
    }, [idx, maxItems]);

    if (!testimonials.length) {
        return null
    }

    // Helper function to get image src with proxy support
    const getImageSrc = (imgPath) => {
        if (!imgPath) return '/user.jpg'
        if (imgPath.startsWith('http://') || imgPath.startsWith('https://') || imgPath.startsWith('/')) return imgPath
        return `/api/proxy?key=${encodeURIComponent(imgPath)}`
    }

    return (
        <div className="flex w-full py-20 items-center justify-center px-4 md:px-32 border-b border-borderColor flex-col gap-12 relative">
            <Grid />
            <div className="flex flex-col items-center gap-3 z-10">
                <h3>Testimonials</h3>
                <h1>What Customers Say</h1>
                <div className='border-t w-6 h-0 border-1 z-10' />
            </div>
            <div className="flex flex-row items-center justify-center gap-2 md:gap-8">
                <button onClick={prevItem} className="toggleXbutton">
                    <GoChevronLeft size={24} />
                </button>
                <div
                    className={`flex flex-col items-start justify-center py-8 md:py-12 bg-background rounded-xl overflow-hidden transition-all duration-600 ease-in-out border border-[#f1f1f1] ${fade ? 'opacity-100' : 'opacity-0'}`}
                    key={idx}
                    style={{
                        filter: `drop-shadow(3px 1px 5px #e6e6e6) blur(${fade ? 0 : 8}px)`,
                        transition: 'opacity 0.4s, filter 0.4s'
                    }}
                >
                    <div className="flex px-6 md:px-16">
                        <p className="text-sm font-medium tracking-tight mb-2">{testimonials[idx].text}</p>
                    </div>
                    <div className="flex w-full h-0 border-t border-[#f1f1f1] mt-4 mb-8" />
                    <div className="flex flex-row items-center gap-4 px-6 md:px-16">
                        <Image
                            src={getImageSrc(testimonials[idx].avatar)}
                            alt="User Avatar"
                            width={80}
                            height={80}
                            className="w-12 h-12 rounded-full object-cover"
                        />
                        <div className="flex flex-col gap-1">
                            <span className="text-textColor font-semibold">{testimonials[idx].name}</span>
                            <span className="text-lightColor text-xs font-medium">{testimonials[idx].role}</span>
                        </div>
                    </div>


                </div>
                <button onClick={nextItem} className="toggleXbutton">
                    <GoChevronRight size={24} />
                </button>
            </div>
            <div className='flex flex-row items-center gap-2 justify-center'>
                {Array.from({ length: maxItems }).map((_, i) => (
                    <div className={`flex w-2 h-2 rounded-full transition-colors duration-300 ease-in-out ${i === idx ? 'bg-extraLight' : 'bg-borderColor'}`} key={i} />
                ))}
            </div>
        </div>
    )
}

export default Testimonials