'use client'
import { useRef, useEffect, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { services } from "@/lib/services";
import Image from "next/image";


export default function ScrollSnapCards() {
    const containerRef = useRef(null);


    useGSAP(() => {
        gsap.registerPlugin(ScrollTrigger);
        const cardEls = containerRef.current.querySelectorAll('.card');
        const totalCards = cardEls.length;

        gsap.set(cardEls, { y: "100%", scale: 1, rotation: 0 });
        gsap.set(cardEls[0], { y: "0%" });

        const scrollTimeline = gsap.timeline({
            scrollTrigger: {
                trigger: containerRef.current,
                start: "top top",
                end: `+=${window.innerHeight * (totalCards - 1)}`,
                pin: true,
                scrub: 0.5,
                anticipatePin: 1,
            },
        });

        for (let i = 0; i < totalCards - 1; i++) {
            scrollTimeline.to(cardEls[i], {
                scale: 0.5,
                duration: 1,
                ease: "ease.inOut",
            }, i);

            scrollTimeline.to(cardEls[i + 1], {
                y: "0%",
                duration: 1,
                ease: "ease.inOut",
            }, i);
        }
    }, { scope: containerRef });


    return (
        <div
            ref={containerRef}
            className="relative flex"
            style={{ height: `${(services.length - 1) * 100 + 50}vh` }}
        >
            <div className="sticky top-1/3 md:top-10 aspect-square h-[300px] md:h-[50vh] flex items-center justify-center overflow-hidden transition-all ease-in-out duration-500">
                <div className="relative w-full h-[300px] md:h-[50vh]">
                    {services.map((card, index) => (
                        <div
                            key={index}
                            className="card absolute left-0 top-0 w-full h-full flex flex-col border-borderColor border rounded-xl bg-baseColor"
                        >
                            <div className="relative w-full h-1/2">
                                <Image
                                    src={card.image || '/placeholder.jpg'}
                                    alt={card.title}
                                    fill
                                    className="rounded-t-xl object-cover"
                                    style={{ objectFit: "cover" }}
                                />
                            </div>
                            <div className="flex flex-col h-1/2 p-8 justify-center">
                                <p className="flex text-lightColor font-semibold uppercase text-xs">Service</p>
                                <h2 className="font-semibold text-lg mb-2">{card.title}</h2>
                                <p className=" font-normal text-pretty text-xs">{card.description}</p>
                            </div>

                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}