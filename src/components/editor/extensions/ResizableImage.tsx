import { useCallback, useEffect, useRef, useState } from 'react'
import Image from '@tiptap/extension-image'
import { mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { AlignCenter, AlignLeft, AlignRight, Captions, Expand, Move, RotateCw, Scissors, Square } from 'lucide-react'

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
  const rotate = Number(node.attrs.rotate ?? 0)
  const radius = Number(node.attrs.radius ?? 6)
  const crop = Boolean(node.attrs.crop)
  const caption = node.attrs.caption || ''
  const [draftWidth, setDraftWidth] = useState(width)
  const [draftPosition, setDraftPosition] = useState({ x: freeX, y: freeY })
  const draftWidthRef = useRef(width)
  const draftPositionRef = useRef({ x: freeX, y: freeY })

  useEffect(() => {
    draftWidthRef.current = width
    setDraftWidth(width)
  }, [width])

  useEffect(() => {
    const next = { x: freeX, y: freeY }
    draftPositionRef.current = next
    setDraftPosition(next)
  }, [freeX, freeY])

  const stageWidth = useCallback((next: string) => {
    draftWidthRef.current = next
    setDraftWidth(next)
  }, [])

  const stagePosition = useCallback((next: { x: number; y: number }) => {
    draftPositionRef.current = next
    setDraftPosition(next)
  }, [])

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

    stageWidth(`${Math.max(120, Math.round(nextWidth))}px`)
  }, [stageWidth])

  const endResize = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (startWidth.current) {
      updateAttributes({ width: draftWidthRef.current })
    }
    startWidth.current = 0
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [updateAttributes])

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
    stagePosition({
      x: Math.max(0, Math.round(startFreeX.current + event.clientX - startX.current)),
      y: Math.max(0, Math.round(startFreeY.current + event.clientY - startY.current)),
    })
  }, [stagePosition])

  const endMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!isMoving.current) return
    isMoving.current = false
    updateAttributes(draftPositionRef.current)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [updateAttributes])

  return (
    <NodeViewWrapper
      as="figure"
      className={`resizable-image align-${align} ${selected ? 'is-selected' : ''} ${free ? 'free-placement' : ''}`}
      style={free ? { width: draftWidth, left: draftPosition.x, top: draftPosition.y } : { width: draftWidth }}
      draggable
      onPointerDown={beginMove}
      onPointerMove={move}
      onPointerUp={endMove}
    >
      <img
        src={node.attrs.src}
        alt={node.attrs.alt || ''}
        title={node.attrs.title || ''}
        draggable={false}
        loading="lazy"
        decoding="async"
        className={crop ? 'is-cropped' : ''}
        style={{ transform: `rotate(${rotate}deg)`, borderRadius: radius }}
      />
      {caption && <figcaption>{caption}</figcaption>}
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
          <button onClick={() => updateAttributes({ width: '100%', align: 'center' })} title="Make full width"><Expand size={13} /></button>
          <button onClick={() => updateAttributes({ rotate: (rotate + 90) % 360 })} title="Rotate image"><RotateCw size={13} /></button>
          <button onClick={() => updateAttributes({ crop: !crop })} className={crop ? 'active' : ''} title="Toggle crop fill"><Scissors size={13} /></button>
          <button onClick={() => updateAttributes({ radius: radius >= 18 ? 0 : radius + 6 })} title="Border radius"><Square size={13} /></button>
          <button
            onClick={() => {
              const next = window.prompt('Image caption', caption)
              if (next !== null) updateAttributes({ caption: next.trim() })
            }}
            title="Caption"
          >
            <Captions size={13} />
          </button>
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
      rotate: {
        default: 0,
        parseHTML: element => Number(element.getAttribute('data-rotate') || 0),
        renderHTML: attributes => attributes.rotate ? { 'data-rotate': String(attributes.rotate) } : {},
      },
      radius: {
        default: 6,
        parseHTML: element => Number(element.getAttribute('data-radius') || 6),
        renderHTML: attributes => ({ 'data-radius': String(attributes.radius ?? 6) }),
      },
      crop: {
        default: false,
        parseHTML: element => element.getAttribute('data-crop') === 'true',
        renderHTML: attributes => attributes.crop ? { 'data-crop': 'true' } : {},
      },
      caption: {
        default: '',
        parseHTML: element => element.getAttribute('data-caption') || '',
        renderHTML: attributes => attributes.caption ? { 'data-caption': attributes.caption } : {},
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
