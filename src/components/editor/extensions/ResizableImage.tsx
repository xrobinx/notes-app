import { useCallback, useRef } from 'react'
import Image from '@tiptap/extension-image'
import { mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { AlignCenter, AlignLeft, AlignRight, Move } from 'lucide-react'

function ResizableImageView({ node, selected, updateAttributes }: NodeViewProps) {
  const startX = useRef(0)
  const startY = useRef(0)
  const startWidth = useRef(0)
  const startFreeX = useRef(0)
  const startFreeY = useRef(0)
  const side = useRef<'left' | 'right'>('right')
  const isMoving = useRef(false)

  const width = node.attrs.width || 'auto'
  const align = node.attrs.align || 'center'
  const free = Boolean(node.attrs.free)
  const freeX = Number(node.attrs.x ?? 0)
  const freeY = Number(node.attrs.y ?? 0)

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

  const beginMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!free) return
    const target = event.target as HTMLElement
    if (target.closest('button')) return
    event.preventDefault()
    event.stopPropagation()
    startX.current = event.clientX
    startY.current = event.clientY
    startFreeX.current = freeX
    startFreeY.current = freeY
    isMoving.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [free, freeX, freeY])

  const move = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!isMoving.current) return
    updateAttributes({
      x: Math.max(0, Math.round(startFreeX.current + event.clientX - startX.current)),
      y: Math.max(0, Math.round(startFreeY.current + event.clientY - startY.current)),
    })
  }, [updateAttributes])

  const endMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!isMoving.current) return
    isMoving.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }, [])

  return (
    <NodeViewWrapper
      as="figure"
      className={`resizable-image align-${align} ${selected ? 'is-selected' : ''} ${free ? 'free-placement' : ''}`}
      style={free ? { width, left: freeX, top: freeY } : { width }}
      draggable
      onPointerDown={beginMove}
      onPointerMove={move}
      onPointerUp={endMove}
    >
      <img src={node.attrs.src} alt={node.attrs.alt || ''} title={node.attrs.title || ''} draggable={false} loading="lazy" decoding="async" />
      {selected && (
        <div className="image-align-controls" contentEditable={false}>
          <button
            className={free ? 'active' : ''}
            onClick={() => updateAttributes({ free: !free, x: free ? 0 : freeX || 40, y: free ? 0 : freeY || 40 })}
            title={free ? 'Return image to document flow' : 'Free place image'}
          >
            <Move size={13} />
          </button>
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
      free: {
        default: false,
        parseHTML: element => element.getAttribute('data-free') === 'true',
        renderHTML: attributes => attributes.free ? { 'data-free': 'true' } : {},
      },
      x: {
        default: 0,
        parseHTML: element => Number(element.getAttribute('data-x') || 0),
        renderHTML: attributes => attributes.free ? { 'data-x': String(attributes.x ?? 0) } : {},
      },
      y: {
        default: 0,
        parseHTML: element => Number(element.getAttribute('data-y') || 0),
        renderHTML: attributes => attributes.free ? { 'data-y': String(attributes.y ?? 0) } : {},
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
