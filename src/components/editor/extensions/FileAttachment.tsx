import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { FileText, Trash2 } from 'lucide-react'
import { useState } from 'react'

function formatSize(bytes?: number) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileAttachmentView({ node, selected, deleteNode }: NodeViewProps) {
  const { fileName, filePath, fileSize } = node.attrs
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <NodeViewWrapper
      as="span"
      className={`file-attachment ${selected ? 'is-selected' : ''}`}
      contentEditable={false}
      onDoubleClick={() => window.api.files.openPath(filePath)}
      onContextMenu={event => {
        event.preventDefault()
        setConfirmOpen(true)
      }}
      title={`Double-click to open ${fileName}`}
    >
      <span className="file-attachment-icon"><FileText size={18} /></span>
      <span className="file-attachment-body">
        <span className="file-attachment-name">{fileName}</span>
        {fileSize ? <span className="file-attachment-meta">{formatSize(fileSize)}</span> : null}
      </span>
      <button
        className="file-attachment-delete"
        onClick={event => {
          event.stopPropagation()
          setConfirmOpen(true)
        }}
        title="Delete attachment from note"
      >
        <Trash2 size={14} />
      </button>
      {confirmOpen && (
        <span className="file-attachment-confirm" onClick={event => event.stopPropagation()}>
          <span>Remove {fileName}?</span>
          <button onClick={() => { deleteNode(); setConfirmOpen(false) }}>Remove</button>
          <button className="secondary" onClick={() => setConfirmOpen(false)}>Cancel</button>
        </span>
      )}
    </NodeViewWrapper>
  )
}

export const FileAttachment = Node.create({
  name: 'fileAttachment',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      fileName: { default: 'Attachment' },
      filePath: { default: '' },
      fileSize: { default: null },
      fileType: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'file-attachment' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['file-attachment', mergeAttributes(HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileAttachmentView)
  },
})
