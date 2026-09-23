import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
const state = vi.hoisted(() => ({ isLoaded:true, create:vi.fn(), verify:vi.fn(), oauth:vi.fn() }))
vi.mock('@clerk/nextjs', () => ({ useSignUp:()=>({ isLoaded:state.isLoaded, signUp:{ create:state.create, prepareEmailAddressVerification:state.verify, authenticateWithRedirect:state.oauth } }) }))
import SignUpForm from '@/components/AuthComponents/SignUpForm'
beforeEach(()=>{ state.isLoaded=true; state.create.mockReset().mockResolvedValue({}); state.verify.mockReset().mockResolvedValue({}); state.oauth.mockReset() })
afterEach(cleanup)
const submit = () => {
    fireEvent.change(screen.getByRole('textbox',{name:'Email'}),{target:{value:'test@example.com'}})
    fireEvent.change(screen.getByLabelText('Password'),{target:{value:'test-password-only'}})
    fireEvent.click(screen.getByRole('button',{name:'Create free account'}))
}
describe('Free signup',()=>{
    it('creates without payment metadata and enters email verification',async()=>{
        const setVerifying=vi.fn()
        render(<SignUpForm setVerifying={setVerifying}/>)
        submit()
        await waitFor(()=>expect(setVerifying).toHaveBeenCalledWith(true))
        expect(state.create).toHaveBeenCalledWith({emailAddress:'test@example.com',password:'test-password-only'})
        expect(state.verify).toHaveBeenCalledWith({strategy:'email_code'})
    })
    it('shows provider errors and clears the busy state',async()=>{
        state.create.mockRejectedValue({errors:[{longMessage:'Account already exists'}]})
        render(<SignUpForm setVerifying={vi.fn()}/>)
        submit()
        expect(await screen.findByRole('alert')).toHaveTextContent('Account already exists')
        expect(screen.getByRole('button',{name:'Create free account'})).toBeEnabled()
    })
    it('does not submit before Clerk is loaded',()=>{
        state.isLoaded=false
        render(<SignUpForm setVerifying={vi.fn()}/>)
        expect(screen.getByRole('button',{name:'Create free account'})).toBeDisabled()
        expect(state.create).not.toHaveBeenCalled()
    })
})
