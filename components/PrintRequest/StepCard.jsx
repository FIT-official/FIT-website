'use client'

// One numbered step of the print request page: header with a step number
// (filled once the step is complete), title, a short summary of the current
// choice, and the step body.
export default function StepCard({ number, title, summary, done = false, children, className = '' }) {
  return (
    <section aria-labelledby={`print-step-${number}`} className={`min-w-0 rounded-md border border-borderColor bg-background ${className}`}>
      <div className="flex items-center gap-3 border-b border-borderColor px-5 py-3.5">
        <span aria-hidden="true" className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums ${done ? 'bg-textColor text-background' : 'bg-borderColor/60 text-lightColor'}`}>{number}</span>
        <h2 id={`print-step-${number}`} className="min-w-0 flex-1 text-base font-semibold">{title}</h2>
        {summary && <span className="min-w-0 truncate text-xs text-lightColor">{summary}</span>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}
