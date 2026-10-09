import { GUEST_RETURN_GUIDANCE, GUEST_RETURN_DETAILS } from '@/lib/workshopGuestPolicy'
import design from './ClassroomDesign.module.css'

export default function GuestReturnHelp() {
    return <div className={design.guidance}>
        <p>{GUEST_RETURN_GUIDANCE}</p>
        <details><summary>Help returning to class</summary><p>{GUEST_RETURN_DETAILS}</p></details>
    </div>
}
