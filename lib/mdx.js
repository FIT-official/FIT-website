import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const contentDirectory = path.join(process.cwd(), 'content')

export function getContentByPath(contentPath) {
    try {
        const fullPath = path.join(contentDirectory, `${contentPath}.mdx`)
        const fileContents = fs.readFileSync(fullPath, 'utf8')
        const { data, content } = matter(fileContents)

        return {
            frontmatter: data,
            content: content.trim(),
        }
    } catch (error) {
        return null
    }
}

export function updateContentByPath(contentPath, frontmatter, content) {
    try {
        const fullPath = path.join(contentDirectory, `${contentPath}.mdx`)
        const frontmatterString = Object.keys(frontmatter)
            .map(key => `${key}: "${frontmatter[key]}"`)
            .join('\n')

        const fileContent = `---\n${frontmatterString}\n---\n\n${content}`

        // Ensure directory exists
        const dir = path.dirname(fullPath)
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }

        fs.writeFileSync(fullPath, fileContent, 'utf8')
        return true
    } catch (error) {
        console.error('Error updating content:', error)
        return false
    }
}
