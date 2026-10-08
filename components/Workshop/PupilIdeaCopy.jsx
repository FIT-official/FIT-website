export default function PupilIdeaCopy({ copy }) {
    return <div>
        <p className="mt-4">Who it could help: <strong className="font-bold">{copy.target_user}</strong></p>
        <h4 className="font-semibold mt-4">The problem</h4><p className="mt-2 leading-relaxed"><strong className="font-bold">{copy.core_problem}</strong></p>
        <h4 className="font-semibold mt-4">Why it matters</h4><p className="mt-2 leading-relaxed">{copy.importance}</p>
        <h4 className="font-semibold mt-4">The idea</h4><p className="mt-2 leading-relaxed">{copy.solution}</p>
        <h4 className="font-semibold mt-4">How it works</h4><ol className="list-decimal pl-5 mt-2 space-y-2">{copy.how_it_works_steps.map(step => <li key={step}>{step}</li>)}</ol>
        <h4 className="font-semibold mt-4">What to find out</h4><p className="mt-2 leading-relaxed">{copy.source_caveat}</p><p className="mt-2 leading-relaxed">{copy.next_test}</p>
    </div>
}
