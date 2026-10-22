import RestrictedPreview from '@/components/AdvancedClasses/RestrictedPreview'

// One neutral notice for every denial. It never mentions which project was requested, whether it
// exists, or what the library contains.
export default function AccessNotice({ status }) {
  return <>
    {status === 503 && <p role="alert" className="p-4 text-center">We could not check your access just now. Please try again.</p>}
    <RestrictedPreview />
  </>
}
