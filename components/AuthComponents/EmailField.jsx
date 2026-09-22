'use client'
function EmailField({ setEmail, email, required }) {
    return (
        <input
            aria-label="Email"
            autoComplete="email"
            type="email"
            name='email'
            onChange={(e) => setEmail(e.target.value)}
            value={email}
            placeholder="Email"
            className="authInput"
            required={required}
        />
    )
}

export default EmailField
