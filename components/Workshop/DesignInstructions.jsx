'use client'
import { useState } from 'react'
import { designPrompts } from '@/lib/workshopPublication'

export default function DesignInstructions({ copy }) {
    const [message, setMessage] = useState('')
    const prompts = designPrompts(copy)
    async function copyPrompt(value) {
        try { await navigator.clipboard.writeText(value); setMessage('Prompt copied. Ask your teacher to review it before use.') }
        catch { setMessage('Select the prompt text below to copy it.') }
    }
    return <details className="mt-5 border rounded-xl p-4 print:hidden"><summary className="cursor-pointer font-semibold">2D drawing and Tinkercad instructions</summary>
        <p className="mt-3">Read the current drawing, label one change, and keep the original. In your drawing workspace, use the illustration as a fixed reference and add editable marks over it. Save the draft, then submit the drawing separately from your written answers.</p>
        <h5 className="font-semibold mt-4">Build a 3D concept with your teacher</h5><ol className="list-decimal pl-5 mt-2 space-y-2">{copy.modellingSteps?.map(step => <li key={step}>{step}</li>)}</ol>
        <p className="mt-3">Use your assigned Tinkercad workspace. Verify the group, idea and units before opening an existing project. Duplicate it before changing it. Measure supplied parts and ask your teacher to check fit before printing. These instructions do not edit or connect to Tinkercad.</p>
        <p className="mt-3">The prompts below contain the public design description only. They are not sent anywhere by FIT. A teacher or adult conducts the ChatGPT conversation and reviews any generated drawing or instructions. Keep pupil details and private submissions out of the prompt.</p>
        {[['drawing', '2D drawing prompt'], ['modelling', 'Tinkercad instructions prompt']].map(([key, title]) => <details key={key} className="mt-4"><summary className="cursor-pointer font-semibold">{title}</summary><textarea readOnly aria-label={title} rows={8} value={prompts[key]} className="formInput block w-full mt-3" /><button type="button" className="formWhiteButton mt-3" onClick={() => copyPrompt(prompts[key])}>Copy {title}</button></details>)}
        {message && <p role="status" aria-live="polite" className="mt-3">{message}</p>}
    </details>
}
