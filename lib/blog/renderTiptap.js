// Server-side TipTap JSON → HTML. Shared extension list with the admin editor
// (keep node names/attrs in sync — see components/Admin/BlogEditor).
import { generateHTML } from '@tiptap/html/server'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'
import Image from '@tiptap/extension-image'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import { HtmlBlock, injectHtmlBlocks } from './htmlBlock.js'
import { omitRejectedPhoto } from './excludedPhoto.js'

export const tiptapExtensions = [
  StarterKit.configure({ link: false, underline: false }),
  Underline,
  Link.configure({ openOnClick: false }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Image.configure({ inline: false, allowBase64: false }),
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  HtmlBlock,
]

export function renderTiptapHtml(doc) {
  if (!doc || typeof doc !== 'object' || !doc.type) return ''
  try {
    // htmlBlock nodes come out of generateHTML as escaped placeholders;
    // injectHtmlBlocks swaps them back to raw markup (see lib/blog/htmlBlock.js).
    return omitRejectedPhoto(injectHtmlBlocks(generateHTML(doc, tiptapExtensions)))
  } catch (e) {
    console.error('renderTiptapHtml failed:', e?.message || e)
    return ''
  }
}
