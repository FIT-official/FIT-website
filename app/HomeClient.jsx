'use client'


import Header from "@/components/General/Header";
import FeaturedSection from "@/components/Home/FeaturedSection";
import Main from "@/components/Home/Main";
import Divider from "@/components/General/Divider";
import Testimonials from "@/components/Home/Testimonials";
import { useContent } from '@/utils/useContent'
import FeaturedArticles from "@/components/Home/FeaturedArticles";
import { useEffect, useState } from 'react';

export default function Home({ children }) {
  const { content: adBannerContent } = useContent('home/ad-banner', {
    text: ''
  })

  const [hasArticles, setHasArticles] = useState(false);

  useEffect(() => {
    fetch('/api/blog')
      .then(res => res.json())
      .then(data => {
        if (data?.posts?.length > 0) {
          setHasArticles(true);
        } else {
          setHasArticles(false);
        }
      })
      .catch(() => setHasArticles(false));
  }, []);

  return (
    <div className="flex flex-col items-center justify-center w-full ">
      <Main adbanner={adBannerContent.text || null} />
      {children}
      <Divider />
      <FeaturedSection />
      <Divider />
      {hasArticles && (
        <>
          <Header title="Read some of our articles" />
          <Divider />
          <FeaturedArticles/>
          <Divider />
        </>
      )}
      <Header title="Don't take our word" />
      <Divider />
      <Testimonials />
      <Divider />
    </div>
  );
}
