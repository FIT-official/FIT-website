'use client'
import Link from 'next/link'
import AuthDivider from "@/components/AuthComponents/AuthDivider";
import { FaGoogle } from "react-icons/fa";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { useState } from 'react';
import { useSignIn } from '@clerk/nextjs';
import { RxCross2 } from 'react-icons/rx';
import { useRouter } from 'next/navigation';
import PasswordField from './PasswordField';
import EmailField from './EmailField';

function SignInForm() {
    const { isLoaded, signIn } = useSignIn();
    const router = useRouter();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const [error, setError] = useState('');

    const [loading, setLoading] = useState(false);
    const [signInMethod, setSignInMethod] = useState('email');

    async function handleSubmit(e) {
        e.preventDefault();
        if (!isLoaded && !signIn) return null
        setLoading(true);
        setError('');
        try {
            if (signInMethod === 'google') {
                await signIn.authenticateWithRedirect({
                    strategy: 'oauth_google',
                    redirectUrl: '/sign-in/sso-callback',
                    redirectUrlComplete: '/dashboard',
                });
            } else if (signInMethod === 'email') {
                if (!email || !password) {
                    setError('Email and password are required');
                    setLoading(false);
                    return;
                }
                const result = await signIn.create({
                    identifier: email,
                    password: password,
                });
                if (result.status === 'complete') {
                    router.push('/dashboard');
                }
            }
        } catch (error) {
            console.error('Error during sign in:', error);
            setError(error.message || 'An error occurred during sign in');
        }
        setLoading(false);
    };

    const cancelError = () => {
        setError('');
    };

    return (
        <form
            className='flex w-full md:w-[30vw] items-center justify-center flex-col rounded-lg gap-4 transition-all duration-300 ease-in-out'
            onSubmit={handleSubmit}
        >
            <h1> Sign In </h1>
            <h3 className="text-xs uppercase mb-3 mt-2">Don't have an account? <span className="underline hover:text-textColor transition-colors ease-in-out duration-300">
                <Link href='/sign-up'>
                    Sign up
                </Link>
            </span>.
            </h3>
            {error && (
                <div className='flex flex-row items-center justify-between px-4 py-2 rounded-md text-red-800 border-red-800 bg-red-200 text-xs uppercase w-full font-medium'>
                    <div className='w-full truncate overflow-hidden'>
                        {error}
                    </div>
                    <RxCross2 size={14} onClick={cancelError} className='cursor-pointer flex' />
                </div>
            )}



            <PasswordField setPassword={setPassword} required={signInMethod === 'email'} password={password} />
            <EmailField setEmail={setEmail} required={signInMethod === 'email'} email={email} />


            <button onClick={() => setSignInMethod('email')} type='submit' className='authButton2'>
                {loading && signInMethod === 'email' ? (
                    <>
                        Signing In
                        <div className='animate-spin ml-3 border-1 border-t-transparent h-3 w-3 rounded-full' />
                    </>
                ) :
                    'Sign In'
                }
            </button>

            <AuthDivider />

            <button onClick={() => setSignInMethod('google')} type='submit' className='authButton1'>
                {loading && signInMethod === 'email' ? (
                    <>
                        Signing In
                        <div className='animate-spin ml-3 border-1 border-t-transparent h-3 w-3 rounded-full' />
                    </>
                ) :
                    <>
                        Sign in with Google
                        <FaGoogle size={16} />
                    </>
                }

            </button>
        </form>
    )
}

export default SignInForm