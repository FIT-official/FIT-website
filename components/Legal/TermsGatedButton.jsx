'use client'

export default function TermsGatedButton({
  termsRequired = false,
  termsTicked = false,
  onTermsError,
  onClick,
  disabled = false,
  children,
  type = 'button',
  ...props
}) {
  const termsBlocked = termsRequired && !termsTicked

  function handleClick(event) {
    if (disabled) {
      event.preventDefault()
      return
    }

    if (termsBlocked) {
      event.preventDefault()
      event.stopPropagation()
      onTermsError?.()
      return
    }

    onClick?.(event)
  }

  return (
    <button
      {...props}
      type={type}
      disabled={disabled}
      aria-disabled={Boolean(termsBlocked || disabled)}
      onClick={handleClick}
    >
      {children}
    </button>
  )
}
