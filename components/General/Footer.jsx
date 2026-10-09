'use client'
import Logo from '../Logo'
import { FaLinkedin, FaWhatsapp } from 'react-icons/fa'
import { HiOutlineMail } from 'react-icons/hi'
import Link from 'next/link'
import { siteFacts } from '@/lib/home/siteFacts'
import { VisitDetails, whatsappHref } from '@/components/Home/v2/FactSections'

function Footer() {
    const whatsapp = whatsappHref(siteFacts.whatsappNumber);
    return (
        <footer className='flex flex-col w-full min-h-[40vh] px-12 py-12'>
            {/* top section */}
            <div className='flex flex-col md:flex-row pb-12 justify-start md:justify-between border-b border-borderColor grow-8'>
                {/* logo section */}
                <div className='flex flex-col justify-start items-start mb-4'>
                    <Logo
                        width={60}
                        height={60}
                    />
                </div>

                {/* links section */}
                <div className='flex flex-col md:flex-row flex-wrap gap-8 lg:gap-20 mx-2'>
                    <div className='flex flex-col gap-3'>
                        <div className='uppercase tracking-wide font-semibold'>Fabrication services</div>
                        <Link href='/research-fabrication' className='footerLink'>Research and business projects</Link>
                        <Link href='/metal-fabrication' className='footerLink'>Metal fabrication</Link>
                        <Link href='/3d-design-printing' className='footerLink'>3D design and printing</Link>
                        <Link href='/electronics-prototyping' className='footerLink'>Custom electronics</Link>
                    </div>
                    <div className='flex flex-col gap-3'>
                        <div className='uppercase tracking-wide font-semibold'>Learn and make</div>
                        <Link href='/school-programmes' className='footerLink'>School programmes</Link>
                        <Link href='/company-workshops' className='footerLink'>Company workshops</Link>
                        <Link href='/blog' className='footerLink'>3D printing and electronics guides</Link>
                    </div>
                    <div className='flex flex-col gap-6'>
                        <div className='flex flex-col gap-3'>
                            <div className='uppercase tracking-wide font-semibold'>Legal</div>
                            <Link href='/terms' className='footerLink'>Terms & Conditions</Link>
                            <Link href='/privacy' className='footerLink'>Privacy Policy</Link>
                        </div>

                    </div>

                    <div className='flex flex-col gap-6'>
                        <div className='flex flex-col gap-3'>
                            <div className='uppercase tracking-wide font-semibold'>Contact Us</div>
                            <Link href='mailto:fixittoday.contact@gmail.com' className='footerLink'>
                                <HiOutlineMail size={16} className='flex' /> Email
                            </Link>
                            {/* <Link href='https://instagram.com' target="_blank" rel="noopener noreferrer" className='footerLink'>
                                <FaInstagram size={16} className='flex' /> Instagram
                            </Link> */}
                            <VisitDetails />
                            {whatsapp && <Link href={whatsapp} target="_blank" rel="noopener noreferrer" className='footerLink'>
                                <FaWhatsapp size={16} className='flex' /> WhatsApp
                            </Link>}
                            {/* <Link href='https://telegram.org' target="_blank" rel="noopener noreferrer" className='footerLink'>
                                <FaTelegram size={16} className='flex' /> Telegram
                            </Link>
                            <Link href='https://telegram.org' target="_blank" rel="noopener noreferrer" className='footerLink'>
                                <FaFacebook size={16} className='flex' /> Facebook
                            </Link> */}
                            <Link href='https://www.linkedin.com/company/fix-it-today-sg' target="_blank" rel="noopener noreferrer" className='footerLink'>
                                <FaLinkedin size={16} className='flex' /> Linkedin
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* bottom section */}
            <div className='flex flex-col md:flex-row pt-6 justify-between items-center'>
                <div className='flex text-sm tracking-tight'>
                    <span className='opacity-60'>Website created by</span> <a href="https://www.linkedin.com/in/sabaxazad/" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity ease-in-out duration-300 ml-1">Saba Azad</a>
                </div>
                <div className='flex text-sm tracking-tight opacity-60'>
                    © {new Date().getFullYear()} Fix It Today. All rights reserved.
                </div>
            </div>
        </footer>
    )
}

export default Footer
