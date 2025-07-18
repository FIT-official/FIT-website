'use client'

function SelectField({ onChangeFunction, value, name, label, options }) {
    return (
        <div className="flex flex-col gap-2 w-full">
            {label &&
                (
                    <label htmlFor={name} className="formLabel">{label}</label>
                )}

            <div className="relative">
                <select
                    id={name}
                    name={name}
                    value={value}
                    onChange={onChangeFunction}
                    className="formSelect"
                    required
                >
                    {options.map((option, index) => (
                        <option key={index} value={option.value}>
                            {option.label}
                        </option>
                    ))}

                </select>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.2" stroke="currentColor" className="h-5 w-5 ml-1 absolute top-1.5 md:top-2 right-1 md:right-2.5 text-extraLight">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                </svg>
            </div>

        </div>
    )
}

export default SelectField