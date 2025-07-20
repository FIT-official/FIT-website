'use client'
import ScrollSnapCards from "./ScrollSnapCards";
import { useEffect, useState } from "react"
import MobileServicesComponent from "./MobileServicesComponent";

function ServicesSection() {
    const [mobile, setMobile] = useState(
        typeof window !== "undefined" ? window.innerWidth < 768 : false
    );

    useEffect(() => {
        function handleResize() {
            setMobile(window.innerWidth < 768);
        }
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return (
        <div className="flex flex-col lg:flex-row w-full gap-20 px-12 md:px-32 py-20">
            <div className='flex flex-col gap-8 w-full lg:w-[40%] mt-4'>
                <div className='flex flex-col gap-2'>
                    <h3>Our Services</h3>
                    <h1>
                        What We Offer
                    </h1>
                </div>
                <p className='w-full text-pretty flex text-sm'>
                    Lorem ipsum dolor sit amet consectetur, adipisicing elit. Quam eum commodi libero, dicta illum ducimus natus. Tenetur, velit eveniet inventore voluptatum magnam perspiciatis perferendis nostrum accusantium consectetur provident quidem nam.
                </p>
            </div>
            <div className="flex w-full lg:w-[60%] items-center justify-center">
                {mobile === undefined && (
                    <div className="loader" />
                )}
                {mobile ? (
                    <MobileServicesComponent />
                ) : (
                    <ScrollSnapCards />
                )}
            </div>
        </div>
    )
}

export default ServicesSection