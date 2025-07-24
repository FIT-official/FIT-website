import Header from "@/components/General/Header"
import ServicesSection from "./components/ServicesSection"
import BenefitsSection from "./components/BenefitsSection"
import IntroductionSection from "./components/IntroductionSection"

export const metadata = {
    title: "About Us | Fix It Today®",
    description: "Learn more about Fix It Today® and our mission.",
    openGraph: {
        title: "About Us | Fix It Today®",
        description:
            "Learn more about Fix It Today® and our mission.",
        url: "https://fixitoday.com/about",
        siteName: "Fix It Today®",
        images: [
            {
                url: "/fitogimage.png",
                width: 800,
                height: 800,
                alt: "Fix It Today® Photo",
            },
        ],
        locale: "en_SG",
        type: "website",
    },
};


function About() {
    return (
        <div className='flex w-full flex-col pt-12 border-b border-borderColor'>
            <IntroductionSection />
            <BenefitsSection />
            <Header title="OUR SERVICES" />
            <ServicesSection />
        </div>
    )
}

export default About