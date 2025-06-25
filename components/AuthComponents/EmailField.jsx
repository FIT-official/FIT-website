'use client'
function EmailField({ setEmail, email, required }) {
    return (
        <input
            htmlFor="email"
            type="text"
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