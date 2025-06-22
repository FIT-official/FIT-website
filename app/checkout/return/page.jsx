'use client'
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import React, { useEffect, useState } from 'react'

function Return() {
    const [status, setStatus] = useState(null);
    const [customerEmail, setCustomerEmail] = useState('');
    const urlParams = useSearchParams();
    const sessionId = urlParams.get('session_id');

    useEffect(() => {
        fetch(`/api/checkout/session/${sessionId}`)
            .then((res) => res.json())
            .then(async (data) => {
                setStatus(data.session.status);
                const email = await data.session.customer_details?.email;
                setCustomerEmail(email);
                if (data.session.status === 'complete') {
                    const confEmailSent = `emailSent_${sessionId}`;
                    if (!localStorage.getItem(confEmailSent)) {
                        try {
                            await fetch("/api/user/checkout/confirmation", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ email }),
                            });
                            localStorage.setItem(confEmailSent, "true");
                        } catch (err) {
                            console.error("Failed to send confirmation email:", err);
                        }
                    }

                    fetch('/api/user/checkout', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                    })
                        .then((res) => res.json())
                        .catch((error) => {
                            console.error('Error during checkout:', error);
                        });
                }
            });
    }, []);

    if (status === 'open') {
        return (
            <div className='flex flex-col items-center justify-center h-screen w-screen'>
                <Link href='/checkout'>Go to checkout</Link>
            </div>
        )
    }

    if (status === 'complete') {
        return (
            <div className='flex flex-col items-center justify-center h-screen w-screen'>
                <p className='w-1/2 text-center'>
                    We appreciate your business! A confirmation email will be sent to {customerEmail}.

                    If you have any questions, please email <a href="mailto:orders@example.com">orders@example.com</a>.
                </p>
            </div>
        )
    }

    return (
        <div className='flex flex-col items-center justify-center h-screen w-screen'>
            {status ? status : 'Loading...'}
        </div>
    )
}

export default Return