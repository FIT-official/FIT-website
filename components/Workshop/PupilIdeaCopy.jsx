import DesignInstructions from './DesignInstructions'
export default function PupilIdeaCopy({ copy, editProblemHref, editSolutionHref }) {
    return <div>
        <p className="mt-4">Who it could help: <strong className="font-bold">{copy.target_user}</strong></p>
        <div className="flex items-center gap-3 mt-4"><h4 className="font-semibold">The problem</h4>{editProblemHref && <a className="formWhiteButton" style={{ minHeight: 44 }} href={editProblemHref} aria-label="Edit this problem statement">Edit</a>}</div><p className="mt-2 leading-relaxed"><strong className="font-bold">{copy.core_problem}</strong></p>
        <h4 className="font-semibold mt-4">Why it matters</h4><p className="mt-2 leading-relaxed">{copy.importance}</p>
        <div className="flex items-center gap-3 mt-4"><h4 className="font-semibold">The idea</h4>{editSolutionHref && <a className="formWhiteButton" style={{ minHeight: 44 }} href={editSolutionHref} aria-label="Edit this solution description">Edit</a>}</div><p className="mt-2 leading-relaxed">{copy.solution}</p>
        <h4 className="font-semibold mt-4">How it works</h4><ol className="list-decimal pl-5 mt-2 space-y-2">{copy.how_it_works_steps.map(step => <li key={step}>{step}</li>)}</ol>
        <h4 className="font-semibold mt-4">What to find out</h4><p className="mt-2 leading-relaxed">{copy.source_caveat}</p><p className="mt-2 leading-relaxed">{copy.next_test}</p>
        {copy.revisionNotes?.length > 0 && <section className="mt-5"><h4 className="font-semibold">Feedback revision: changes to try</h4><ul className="list-disc pl-5 mt-2 space-y-2">{copy.revisionNotes.map(note => <li key={note}>{note}</li>)}</ul>{copy.revisionDecision && <p className="mt-3">{copy.revisionDecision}</p>}</section>}
        {copy.originalDrawing && <details className="mt-4"><summary className="cursor-pointer">Earlier drawing is preserved</summary><p className="mt-2">Compare the revision with the original before building.</p><a className="underline inline-block mt-2" href={copy.originalDrawing}>Open the earlier illustration</a></details>}
        {copy.modellingSteps && <DesignInstructions copy={copy} />}
    </div>
}
