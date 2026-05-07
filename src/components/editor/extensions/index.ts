import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Underline from '@tiptap/extension-underline'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import { createLowlight, common } from 'lowlight'
import { ResizableImage } from './ResizableImage'
import { FileAttachment } from './FileAttachment'
import { SearchHighlight } from './SearchHighlight'

const lowlight = createLowlight(common)

const tableCellBackground = {
  default: null,
  parseHTML: (element: HTMLElement) => element.getAttribute('data-background-color') || element.style.backgroundColor || null,
  renderHTML: (attributes: { backgroundColor?: string | null }) => {
    if (!attributes.backgroundColor) return {}
    return {
      'data-background-color': attributes.backgroundColor,
      style: `background-color: ${attributes.backgroundColor}`,
    }
  },
}

const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: tableCellBackground,
    }
  },
})

const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: tableCellBackground,
    }
  },
})

export const editorExtensions = [
  StarterKit.configure({
    codeBlock: false, // replaced by CodeBlockLowlight
  }),
  Highlight.configure({ multicolor: true }),
  TextStyle,
  Color,
  Underline,
  TaskList,
  TaskItem.configure({ nested: true }),
  Table.configure({ resizable: false }),
  TableRow,
  CustomTableHeader,
  CustomTableCell,
  CodeBlockLowlight.configure({ lowlight }),
  ResizableImage.configure({ inline: false, allowBase64: true }),
  FileAttachment,
  Link.configure({
    openOnClick: false,
    autolink: true,
    linkOnPaste: true,
    HTMLAttributes: {
      rel: 'noopener noreferrer',
      target: '_blank',
    },
  }),
  Placeholder.configure({ placeholder: 'Start writing…' }),
  HorizontalRule,
  SearchHighlight,
]
