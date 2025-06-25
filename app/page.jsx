'use client'

import Header from "@/components/General/Header";
import FeaturedSection from "@/components/Home/FeaturedSection";
import Main from "@/components/Home/Main";
import Divider from "@/components/General/Divider";
import Testimonials from "@/components/Home/Testimonials";

export default function Home() {


  return (
    <div className="flex flex-col items-center justify-center w-full ">
      <Main adbanner={'Lorem ipsum dolor sit amet consectetur adipisicing elit.'} />
      <Divider />
      <FeaturedSection />
      <Divider />
      <Header title="Don't take our word" />
      <Divider />
      <Testimonials />
      <Divider />
    </div>
  );
}
