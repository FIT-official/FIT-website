import groups from '@/content/designThinkingWorkshop.json'
import worksheets from '@/content/designThinkingWorksheets.json'
import modelImages from '@/content/designThinkingWorkshopImages.json'
import { workshopIllustrationsPending } from '@/lib/workshopPages'
export const workshopPost = {
    _id: 'fit-design-thinking-workshop-20261009',
    slug: 'design-thinking-workshop',
    title: 'Design-thinking workshop: improve, make and test',
    excerpt: 'Friday 9 October 2026: two ideas for each group, clearer problem statements and a 30-minute plan to explain and test a useful change.',
    status: 'published', publishDate: '2026-10-08T06:00:00.000Z',
    authorName: 'Fix It Today', tags: ['Design thinking', 'Workshop'], categories: ['Programmes'],
    heroImage: null, readingTimeMinutes: 15,
}
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
const list = values => '<ul>' + values.map(value => '<li>' + esc(value) + '</li>').join('') + '</ul>'
export function workshopArticleHtml() {
    return '<p>Workshop session: Friday 9 October 2026.</p><p>Start with a person and a difficulty. Compare two ideas, choose one useful change, draw the parts and plan a fair test. These are design proposals: the drawings and descriptions do not prove that the equipment works.</p><p>Use group numbers only. Share your drawing and explanation with your teacher; keep names, logins and private classroom links out of public work.</p><nav aria-label="Workshop groups">' + groups.map(group => '<a href="#' + group.id + '">Group ' + group.number + '</a>').join(' · ') + '</nav>' + groups.map(group =>
        '<section id="' + group.id + '"><h2>Group ' + group.number + '</h2><p><a href="/workshop/' + group.id + '">Open Group ' + group.number + ' activities and answers</a></p>' + group.ideas.map((idea, index) =>
            '<h3>Idea ' + (index + 1) + ': ' + esc(idea.title) + '</h3>' +
            modelImage(group.id, index) +
            '<h4>Original problem</h4><p>' + esc(idea.originalProblem) + '</p>' +
            '<h4>Original idea</h4><p>' + esc(idea.originalSolution) + '</p>' +
            '<h4>Improved problem</h4><p>' + esc(idea.improvedProblem) + '</p><p>' + esc(idea.reason) + '</p>' +
            '<h4>Changes to investigate</h4>' + list(idea.changes.map(change => change.change + ': ' + change.why)) +
            (idea.howItWorks ? '<h4>How it could work</h4><p>' + esc(idea.howItWorks) + '</p>' : '') +
            (idea.printedParts ? '<p><strong>Printed structure:</strong> ' + esc(idea.printedParts.join('; ')) + '</p><p><strong>Supplied equipment:</strong> ' + esc(idea.suppliedParts.join('; ')) + '</p>' : '') +
            '<h4>Safe testing boundary</h4><p>' + esc(idea.boundary) + '</p><h4>A fair comparison</h4>' + list(idea.test) +
            (idea.measure ? '<p>' + esc(idea.measure) + '</p>' : '') +
            (idea.question ? '<p><strong>Question:</strong> ' + esc(idea.question) + '</p>' : '')
        ).join('') +
        '<h3>Your 30-minute activity</h3>' + group.activities.map(activity => '<h4>' + esc(activity.title) + ' · ' + activity.minutes + ' minutes</h4><p>' + esc(activity.goal) + '</p>' + list(activity.steps) + '<p><strong>Check:</strong> ' + esc(activity.successCheck) + '</p>').join('') + '</section>'
    ).join('') + '<h2>Explain your next step</h2><p>Show who needs help, what you changed, what you kept the same in your comparison and what the result means. If you cannot test safely with the equipment available, explain the test plan instead of claiming a result.</p>'
}
function modelImage(group, index) {
    if (workshopIllustrationsPending) return '<p>Illustration pending review. Use the original idea and written design proposals below for this activity.</p>'
    const key = worksheets.find(sheet => sheet.group === group)?.imageKeys[index]
    const image = modelImages[key]
    return image ? '<figure><img src="' + esc(image.src) + '" alt="' + esc(image.alt) + '" width="' + image.width + '" height="' + image.height + '" loading="lazy"><figcaption>' + esc(image.caption) + '</figcaption></figure>' : ''
}
