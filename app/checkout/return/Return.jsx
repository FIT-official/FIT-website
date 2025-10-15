'use client'
import { useToast } from '@/components/General/ToastProvider';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import React, { useEffect, useState } from 'react'

function Return() {
    const [status, setStatus] = useState(null);
    const [customerEmail, setCustomerEmail] = useState('');
    const urlParams = useSearchParams();
    const sessionId = urlParams.get('session_id');
    const { showToast } = useToast();

    useEffect(() => {
        fetch(`/api/checkout/session/${sessionId}`)
            .then((res) => res.json())
            .then(async (data) => {
                setStatus(data.session.status);
                const email = await data.session.customer_details?.email;
                setCustomerEmail(email);
                if (data.session.status === 'complete') {
                    // Send confirmation email
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
                            showToast('Failed to send confirmation email: ' + err, 'error');
                        }
                    }

                    // Clear print configurations from localStorage after payment success
                    // The webhook will handle creating orders and emptying cart
                    const keys = Object.keys(localStorage);
                    keys.forEach(key => {
                        if (key.startsWith('printConfig_')) {
                            localStorage.removeItem(key);
                        }
                    });
                }
            });
    }, []);

    if (status === 'open') {
        return (
            <div className="min-h-[92vh] flex flex-col items-center p-12 border-b border-borderColor justify-center">
                <h1 className="text-3xl font-bold mb-4 text-textColor">Checkout Incomplete</h1>
                <div className="text-xs text-lightColor mb-8 w-xs text-center">
                    Your payment session is still open. Please complete your payment to finish your order.
                </div>
                <div className="w-full max-w-2xl flex flex-col">
                    <div className="border border-borderColor rounded p-6 flex flex-col items-center">
                        <span className="text-xs font-medium text-lightColor  ">
                            You can return to{' '}
                            <Link href="/checkout" className="text-textColor hover:underline">
                                the checkout page
                            </Link>
                            {' '}to try again.
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    if (status === 'complete') {
        return (
            <div className="min-h-[92vh] flex flex-col items-center p-12 border-b border-borderColor justify-center">
                <h1 className="text-3xl font-bold mb-4 text-textColor">Thank You For Your Order!</h1>
                <div className="text-xs text-lightColor mb-8 w-xs text-center">
                    Your payment was successful.
                </div>
                <div className="w-full max-w-2xl flex flex-col">
                    <div className="border border-borderColor rounded px-6 py-8 flex flex-col items-center bg-white">
                        <span className="text-xs font-medium text-textColor mb-4 text-center">
                            We appreciate your business!<br />
                            A confirmation email will be sent to <span className="font-semibold">{customerEmail}</span>.<br />
                            If you have any questions, please email <a href="mailto:orders@example.com" className="underline">orders@example.com</a>.
                        </span>
                        <Link
                            href="/"
                            className="formBlackButton mt-2"
                        >
                            Back to Home
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className='flex flex-col items-center justify-center h-[92vh] w-full'>
            {status ? status :
                <div className='loader' />
            }
        </div>
    )
}

export default Return