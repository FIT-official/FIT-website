import Header from "@/components/General/Header"
import ServicesSection from "./components/ServicesSection"
import BenefitsSection from "./components/BenefitsSection"
import IntroductionSection from "./components/IntroductionSection"

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