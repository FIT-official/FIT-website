import React, { createContext, useContext, useMemo, useState, Suspense } from 'react'
const User = createContext(null)
const previewUser = { id: 'preview-user', fullName: 'Preview Customer' }
export function PreviewProviders({ children }) { const [user, setUser] = useState(() => sessionStorage.getItem('fit-preview-user') ? previewUser : null); return <User.Provider value={{ user, setUser }}>{children}</User.Provider> }
export function useUser() { const { user } = useContext(User); return { user, isLoaded: true, isSignedIn: Boolean(user) } }
export function SignInButton({ children }) { const { setUser } = useContext(User); return React.cloneElement(children, { onClick: () => { sessionStorage.setItem('fit-preview-user', '1'); setUser(previewUser) } }) }
const router = { push: path => { window.location.href = path.startsWith('/editor') ? '/flow.html' + path.slice('/editor'.length) + '&view=editor' : '/flow.html?finished=1' }, back: () => history.back() }
export function useRouter() { return router }
export function useSearchParams() { return useMemo(() => new URLSearchParams(window.location.search), []) }
const toast = { showToast: message => { document.getElementById('preview-status').textContent = message } }
export function useToast() { return toast }
export const telemetry = { capture() {} }
export function Link({ children, href, ...props }) { return <a href={href} {...props}>{children}</a> }
export function dynamic(load) { const Component = React.lazy(load); return function PreviewDynamic(props) { return <Suspense fallback={<p>Loading preview…</p>}><Component {...props} /></Suspense> } }
