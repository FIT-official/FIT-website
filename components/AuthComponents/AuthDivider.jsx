function AuthDivider() {
    return (
        <div className="flex flex-row items-center justify-center w-full">
            <div className='w-full h-0 border-t border-borderColor my-4' />
            <span className="mx-2 flex uppercase text-xs text-extraLight font-medium">OR</span>
            <div className='w-full h-0 border-t border-borderColor my-4' />
        </div>
    )
}

export default AuthDivider