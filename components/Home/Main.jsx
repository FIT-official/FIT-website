'use client'

import { motion, cubicBezier } from 'framer-motion';
import Image from 'next/image';

function Main({ adbanner }) {
    const text = "FIX IT TODAY®";
    const letters = Array.from(text);

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


        <div className="flex relative flex-col w-full h-[92vh] items-center justify-center overflow-hidden">

            {adbanner && (
                <div className="flex px-8 uppercase items-center justify-center w-full top-0 left-0 bg-textColor h-10 absolute z-10 text-background">
                    <div className="truncate text-xs font-semibold text-center tracking-wide">
                        {adbanner}
                    </div>
                </div>
            )}
            <Image
                src="/bg5.jpg"
                alt="Background"
                fill
                priority
                className="
            object-cover
            object-[75%_center] sm:object-center
            z-0
            transition-[object-position] duration-500 ease-in-out grayscale-60 opacity-90
          "
            />
            <div className="relative z-10 flex flex-col items-center w-full text-background text-center px-4">
                <motion.h1
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    aria-label={text}
                >
                    {letters.map((letter, index) => (
                        <div
                            key={index}
                            className='inline-block overflow-hidden relative leading-none h-[32px] md:h-[64px]'
                        >
                            <motion.span
                                variants={letterVariants}
                                className='block text-background text-4xl md:text-7xl font-black'
                            >
                                {letter === " " ? "\u00A0" : letter}
                            </motion.span>
                        </div>
                    ))}
                </motion.h1>
                <motion.div
                    className="font-semibold uppercase text-xs md:text-lg"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: { duration: 0.5 } }}>
                    3D printing and modeling services
                </motion.div>
            </div>
        </div>

    )
}

export default Main