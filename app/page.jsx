'use client'

import Header from "@/components/General/Header";
import FeaturedSection from "@/components/Home/FeaturedSection";
import Main from "@/components/Home/Main";
import Divider from "@/components/General/Divider";
import Testimonials from "@/components/Home/Testimonials";
import { useContent } from '@/utils/useContent'
import FeaturedArticles from "@/components/Home/FeaturedArticles";

export default function Home() {
  const { content: adBannerContent } = useContent('home/ad-banner', {
    text: ''
  })

  return (
    <div className="flex flex-col items-center justify-center w-full ">
      <Main adbanner={adBannerContent.text || null} />
      <Divider />
      <FeaturedSection />
      <Divider />
      <Header title="Read some of our articles" />
      <Divider />
      <FeaturedArticles/>
      <Divider />
      <Header title="Don't take our word" />
      <Divider />
      <Testimonials />
      <Divider />
    </div>
  );
}
