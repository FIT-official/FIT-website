import Image from 'next/image'
import PupilIdeaCopy from './PupilIdeaCopy'
import design from './ClassroomDesign.module.css'
export default function GuestIdeaReading({ group, idea = '1' }) {
    const item = group.reading?.ideas[Number(idea) - 1]
    if (!item) return <p>Choose an idea to read.</p>
    return <article className="min-w-0" aria-label={'Group ' + group.number + ' Idea ' + idea}>
        <span className={design.ideaLabel}>Group {group.number} · Idea {idea}</span><h3 className="text-2xl font-bold">Idea {idea}: {item.title}</h3>
        {(item.illustrations || []).filter(image => image.approved).map(image => <figure key={image.src} className={design.illustration + ' mt-4'}><Image src={image.src} alt={image.alt} width={image.width} height={image.height} className="w-full h-auto" sizes="(min-width: 1100px) 45vw, 90vw" /><figcaption className="text-sm mt-2">{image.caption}</figcaption></figure>)}
        {item.pupilCopy ? <PupilIdeaCopy copy={item.pupilCopy} /> : <><h4 className="font-bold mt-5">The problem</h4><p className="mt-2 leading-relaxed">{item.problemContext}</p>
        <h4 className="font-bold mt-5">The idea</h4><p className="mt-2 leading-relaxed">{item.originalIntent}</p>
        <h4 className="font-bold mt-5">Suggested improvement</h4><p className="mt-2 leading-relaxed">{item.recommendedRefinement}</p>
        <h4 className="font-bold mt-5">How it works</h4><p className="mt-2 leading-relaxed">{item.studentExplanation}</p>
        <details className="mt-4"><summary className="cursor-pointer font-semibold">Steps, parts and what to test</summary><ol className="list-decimal pl-5 space-y-2 mt-3">{item.mechanismSteps.map(step => <li key={step}>{step}</li>)}</ol><ul className="list-disc pl-5 mt-3">{item.parts.map(part => <li key={part}>{part}</li>)}</ul><p className="mt-3">{item.designSafeguards}</p><p className="mt-3">{item.nextTest}</p></details></>}
    </article>
}
