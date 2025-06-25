function CodeField({ code, setCode, inputsRef }) {
    const handleInputChange = (e, idx) => {
        const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 1)
        let newCode = code.split('')
        newCode[idx] = val
        newCode = newCode.join('').padEnd(6, '')
        setCode(newCode)
        if (val && idx < 5) {
            inputsRef.current[idx + 1]?.focus()
        }
    }

    const handleKeyDown = (e, idx) => {
        if (e.key === 'Backspace' && !code[idx] && idx > 0) {
            inputsRef.current[idx - 1]?.focus()
        }
    }

    const handlePaste = (e) => {
        const paste = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6)
        if (paste.length > 1) {
            setCode(paste.padEnd(6, ''))
            setTimeout(() => {
                inputsRef.current[Math.min(paste.length, 5)]?.focus()
            }, 0)
            e.preventDefault()
        }
    }

    return (
        <div className="flex gap-2 w-full justify-center my-4">
            {[...Array(6)].map((_, idx) => (
                <input
                    key={idx}
                    ref={el => inputsRef.current[idx] = el}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    className="w-10 h-12 text-center border border-borderColor rounded-lg text-2xl font-medium focus:border-extraLight focus:border-1 outline-none transition-all duration-100 ease-in-out"
                    value={code[idx] || ''}
                    onChange={e => handleInputChange(e, idx)}
                    onKeyDown={e => handleKeyDown(e, idx)}
                    onPaste={handlePaste}
                />
            ))}
        </div>
    )
}

export default CodeField