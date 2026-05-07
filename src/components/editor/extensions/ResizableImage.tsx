import { useCallback, useRef } from 'react'
import Image from '@tiptap/extension-image'
import { mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react'

function ResizableImageView({ node, selected, updateAttributes }: NodeViewProps) {
  const startX = useRef(0)
  const startWidth = useRef(0)
  const side = useRef<'left' | 'right'>('right')

  const width = node.attrs.width || 'auto'
  const align = node.attrs.align || 'center'

  const beginResize = useCallback((event: React.PointerEvent<HTMLButtonElement>, handleSide: 'left' | 'right') => {
    event.preventDefault()
    event.stopPropagation()

    const image = event.currentTarget.parentElement?.querySelector('img')
    if (!image) return

    startX.current = event.clientX
    startWidth.current = image.getBoundingClientRect().width
    side.current = handleSide
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const resize = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!startWidth.current) return

    const delta = event.clientX - startX.current
    const nextWidth = side.current === 'right'
      ? startWidth.current + delta
      : startWidth.current - delta

    updateAttributes({ width: `${Math.max(120, Math.round(nextWidth))}px` })
  }, [updateAttributes])

  const endResize = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    startWidth.current = 0
    event.currentTarget.releasePointerCapture(event.pointerId)
  }, [])

  return (
    <NodeViewWrapper
      as="figure"
      className={`resizable-image align-${align} ${selected ? 'is-selected' : ''}`}
      style={{ width }}
      draggable
    >
      <img src={node.attrs.src} alt={node.attrs.alt || ''} title={node.attrs.title || ''} draggable={false} loading="lazy" decoding="async" />
      {selected && (
        <div className="image-align-controls" contentEditable={false}>
          <button onClick={() => updateAttributes({ align: 'left' })} title="Align image left"><AlignLeft size={13} /></button>
          <button onClick={() => updateAttributes({ align: 'center' })} title="Align image center"><AlignCenter size={13} /></button>
          <button onClick={() => updateAttributes({ align: 'right' })} title="Align image right"><AlignRight size={13} /></button>
        </div>
      )}
      <button
        className="image-resize-handle image-resize-handle--left"
        contentEditable={false}
        onPointerDown={event => beginResize(event, 'left')}
        onPointerMove={resize}
        onPointerUp={endResize}
        aria-label="Resize image from left"
      />
      <button
        className="image-resize-handle image-resize-handle--right"
        contentEditable={false}
        onPointerDown={event => beginResize(event, 'right')}
        onPointerMove={resize}
        onPointerUp={endResize}
        aria-label="Resize image from right"
      />
    </NodeViewWrapper>
  )
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: element => element.getAttribute('width') || element.style.width || null,
        renderHTML: attributes => {
          if (!attributes.width) return {}
          return {
            width: attributes.width,
            style: `width: ${attributes.width}`,
          }
        },
      },
      align: {
        default: 'center',
        parseHTML: element => element.getAttribute('data-align') || 'center',
        renderHTML: attributes => ({
          'data-align': attributes.align || 'center',
        }),
      },
    }
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  },
})
