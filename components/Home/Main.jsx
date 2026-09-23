'use client'

import { motion, cubicBezier } from 'framer-motion';
import Image from 'next/image';
import { useState } from 'react'

function Main({ adbanner, initialHeroContent }) {
    const content = initialHeroContent || {
        text: '3D printing and modeling services',
        heroImage: null,
        darkOverlay: false
    }

    const text = "FIX IT TODAY®";
    const letters = Array.from(text);

    const image = typeof content.heroImage === 'string' ? content.heroImage.trim() : ''
    // Select the saved image during server rendering so it can be preloaded.
    // The old cat placeholder must never stand in for a pending or failed image.
    const heroSrc = !image || image.split(/[?#]/)[0] === '/placeholder.jpg' ? null
        : /^(https?:\/\/|\/)/.test(image) ? image : `/api/proxy?key=${encodeURIComponent(image)}`
    const [failedSrc, setFailedSrc] = useState(null)

    const containerVariants = {
        hidden: { opacity: 1 },
        visible: (i = 1) => ({
            opacity: 1,
            transition: { staggerChildren: 0.035, delayChildren: 0.005 * i },
        }),
    };

    const letterVariants = {
        hidden: {
            y: "100%",
            transition: { type: "tween", ease: cubicBezier(.18, .64, .0, 1.0), duration: 0.8 },
        },
        visible: {
            y: "0%",
            transition: { type: "tween", ease: cubicBezier(.18, .64, .0, 1.0), duration: 0.8 },
        },
    };
    return (


        <div className="flex relative flex-col w-full h-[92vh] items-center justify-center overflow-hidden bg-textColor">

            {adbanner && (
                <div className="flex px-8 uppercase items-center justify-center w-full top-0 left-0 bg-textColor h-10 absolute z-10 text-background">
                    <div className="truncate text-xs font-semibold text-center tracking-wide">
                        {adbanner}
                    </div>
                </div>
            )}
            {heroSrc && failedSrc !== heroSrc && (
                <Image
                    key={heroSrc}
                    src={heroSrc}
                    alt="Background"
                    fill
                    priority
                    sizes="100vw"
                    className={`
                        object-cover
                        object-[75%_center] sm:object-center
                        z-0
                        opacity-90
                    `}
                    onError={() => setFailedSrc(heroSrc)}
                />
            )}
            {Boolean(content?.darkOverlay) && (
                // darkOverlay is a 0–80 percentage (legacy boolean true = 50);
                // clamp so a raw API write can never black out the hero
                <div className="absolute inset-0 bg-black z-[5]" style={{ opacity: Math.min(80, content.darkOverlay === true ? 50 : Number(content.darkOverlay) || 0) / 100 }} />
            )}
            <div className="relative z-10 flex flex-col items-center w-full text-background text-center px-4">
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    aria-label={text}
                >
                    {letters.map((letter, index) => (
                        <div
                            key={index}
                            className='inline-block overflow-hidden relative leading-none h-8 md:h-16'
                        >
                            <motion.span
                                variants={letterVariants}
                                className='block text-background text-4xl md:text-7xl font-black'
                            >
                                {letter === " " ? "\u00A0" : letter}
                            </motion.span>
                        </div>
                            ))}
                        </motion.div>
                        <motion.div
                            className="font-semibold uppercase text-xs md:text-lg"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1, transition: { duration: 0.5 } }}>
                            {content.text}
                        </motion.div>
            </div>
        </div>

    )
}

export default Main
