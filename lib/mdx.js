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
        // Serialize frontmatter to YAML-like string; supports nested objects and arrays
        const serialize = (obj, indent = 0) => {
            const pad = '  '.repeat(indent)
            return Object.keys(obj).map(key => {
                const val = obj[key]
                if (val === null || val === undefined) {
                    return `${pad}${key}: ""
`
                }
                if (Array.isArray(val)) {
                    if (val.length === 0) return `${pad}${key}: []\n`
                    let out = `${pad}${key}:\n`
                    for (const item of val) {
                        if (typeof item === 'object') {
                            out += `${pad}-\n${serialize(item, indent + 2)}`
                        } else {
                            out += `${pad}- ${String(item)}\n`
                        }
                    }
                    return out
                }
                if (typeof val === 'object') {
                    return `${pad}${key}:\n${serialize(val, indent + 1)}`
                }
                // primitive
                const escaped = String(val).replace(/"/g, '\\"')
                return `${pad}${key}: "${escaped}"\n`
            }).join('')
        }

        const frontmatterString = serialize(frontmatter)

        const fileContent = `---\n${frontmatterString}---\n\n${content}`
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
