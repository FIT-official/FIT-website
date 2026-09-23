'use client'
import { useState } from 'react'
import { FiEye, FiEyeOff } from 'react-icons/fi';

function PasswordField({ setPassword, password, required }) {
    const [showPassword, setShowPassword] = useState(false);
    return (
        <div className='flex w-full relative'>
            <input
                aria-label="Password"
                name='password'
                type={showPassword ? 'text' : 'password'}
                onChange={(e) => setPassword(e.target.value)}
                value={password}
                placeholder="Password"
                className="authInput"
                required={required}
            />
            <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className='absolute right-4 top-3.25 text-extraLight cursor-pointer'
                onClick={() => setShowPassword((prev) => !prev)}
            >
                {showPassword ? <FiEyeOff /> : <FiEye />}
            </button>
        </div>
    )
}

export default PasswordField
