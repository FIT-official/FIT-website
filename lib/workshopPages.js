import groups from '@/content/designThinkingWorkshop.json'
import worksheets from '@/content/designThinkingWorksheets.json'
import images from '@/content/designThinkingWorkshopImages.json'
import readingDraft from '@/content/workshopStudentReadingDraft.json'
import { publishedCopy, publishedIdea } from './workshopPublication'
// Reviewed discussion illustrations are verified PDF-derived assets.
// Caption notes distinguish source concepts from proposed, untested embodiments.
export const workshopIllustrationsPending = false
export const workshopGroups = groups
export function workshopGroupPage(id) {
    const group = groups.find(item => item.id === id)
    if (!group) return null
    const worksheet = worksheets.find(item => item.group === id)
    return { ...group, ideas: group.ideas.map(idea => ({ ...idea, pupilCopy: publishedCopy(idea.pupilCopy) })), worksheet, models: worksheet.imageKeys.map(key => workshopIllustrationsPending ? null : publishedIdea(key)?.asset || images[key] || null) }
}
// Draft reading is exposed only by the authenticated classroom/isolated preview.
// Public workshop/blog pages continue to use the canonical approved v3 content.
export function workshopClassroomGroupPage(id) { const group = workshopGroupPage(id), reading = group && readingDraft.groups.find(row => row.groupNumber === group.number); return group && { ...group, reading: reading && { ...reading, ideas: reading.ideas.map(idea => ({ ...idea, pupilCopy: publishedCopy(idea.pupilCopy), illustrations: [publishedIdea(idea.reviewedImageKey)?.asset || images[idea.reviewedImageKey]] })) } } }
export function assertWorkshopImagesReady() {
    if (workshopIllustrationsPending) return true
    for (const worksheet of worksheets) for (const key of worksheet.imageKeys) {
        const image = images[key]
        if (!image || !/^\/workshop\/models\/[a-z0-9_-]+\.(png|jpg|jpeg|webp)$/.test(image.src) || !image.alt || !image.caption || /nygh-printed-mechanism/i.test(image.src)) throw new Error('Missing reviewed workshop image: ' + key)
    }
    return true
}
