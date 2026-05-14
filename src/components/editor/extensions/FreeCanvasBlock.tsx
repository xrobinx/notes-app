import { useEffect, useRef, useState } from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import {
  ArrowRight, Eraser, Highlighter, Image, MousePointer2, PenLine, Smile, Trash2, Type,
} from 'lucide-react'

type ArrowKind =
  | 'right'
  | 'left'
  | 'up'
  | 'down'
  | 'upRight'
  | 'upLeft'
  | 'downRight'
  | 'downLeft'
  | 'doubleHorizontal'
  | 'doubleVertical'
  | 'longRight'
  | 'longLeft'
  | 'turnRight'
  | 'turnLeft'
  | 'heavyRight'
  | 'heavyLeft'

type CanvasItem =
  | { id: string; type: 'text'; x: number; y: number; text: string }
  | { id: string; type: 'sticker'; x: number; y: number; text: string }
  | { id: string; type: 'arrow'; x: number; y: number; arrow: ArrowKind }
  | { id: string; type: 'image'; x: number; y: number; src: string; width: number }

type Stroke = { id: string; color: string; width: number; points: [number, number][] }
type Tool = 'select' | 'pen' | 'highlight' | 'erase' | 'placeArrow' | 'placeSticker'
type ResizeEdge = 'bottom' | 'right' | 'corner'

const STICKERS = [
  '\u2B50', '\u2705', '\u{1F525}', '\u{1F4A1}', '\u{1F4CC}', '\u2764\uFE0F', '\u26A0\uFE0F', '\u2753',
  '\u{1F3AF}', '\u{1F680}', '\u{1F4DA}', '\u{1F9E0}', '\u2728', '\u{1F4DD}', '\u{1F512}', '\u{1F4CE}',
  '\u{1F600}', '\u{1F642}', '\u{1F60E}', '\u{1F914}', '\u{1F44D}', '\u{1F44E}', '\u{1F64C}', '\u{1F44F}',
  '\u{1F3C6}', '\u{1F4B0}', '\u{1F4C5}', '\u{1F4C8}', '\u{1F9E9}', '\u{1F3A8}', '\u{1F50D}', '\u{1F514}',
]

const ARROWS: Array<{ key: ArrowKind; symbol: string; label: string }> = [
  { key: 'right', symbol: '\u2192', label: 'Right' },
  { key: 'left', symbol: '\u2190', label: 'Left' },
  { key: 'up', symbol: '\u2191', label: 'Up' },
  { key: 'down', symbol: '\u2193', label: 'Down' },
  { key: 'upRight', symbol: '\u2197', label: 'Up right' },
  { key: 'upLeft', symbol: '\u2196', label: 'Up left' },
  { key: 'downRight', symbol: '\u2198', label: 'Down right' },
  { key: 'downLeft', symbol: '\u2199', label: 'Down left' },
  { key: 'doubleHorizontal', symbol: '\u2194', label: 'Left and right' },
  { key: 'doubleVertical', symbol: '\u2195', label: 'Up and down' },
  { key: 'longRight', symbol: '\u27F6', label: 'Long right' },
  { key: 'longLeft', symbol: '\u27F5', label: 'Long left' },
  { key: 'turnRight', symbol: '\u21B1', label: 'Turn right' },
  { key: 'turnLeft', symbol: '\u21B0', label: 'Turn left' },
  { key: 'heavyRight', symbol: '\u27A4', label: 'Heavy right' },
  { key: 'heavyLeft', symbol: '\u2B05', label: 'Heavy left' },
]

function parseItems(value: unknown): CanvasItem[] {
  if (Array.isArray(value)) return value as CanvasItem[]
  if (typeof value !== 'string') return []
  try { return JSON.parse(value) as CanvasItem[] } catch { return [] }
}

function parseStrokes(value: unknown): Stroke[] {
  if (Array.isArray(value)) return value as Stroke[]
  if (typeof value !== 'string') return []
  try { return JSON.parse(value) as Stroke[] } catch { return [] }
}

function FreeCanvasView({ node, selected, updateAttributes }: NodeViewProps) {
  const items = parseItems(node.attrs.items)
  const strokes = parseStrokes(node.attrs.strokes)
  const height = Number(node.attrs.height || 420)
  const width = Number(node.attrs.width || 0)
  const [tool, setTool] = useState<Tool>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, itemX: 0, itemY: 0 })
  const [arrowPickerOpen, setArrowPickerOpen] = useState(false)
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false)
  const [activeArrow, setActiveArrow] = useState<ArrowKind>('right')
  const [activeSticker, setActiveSticker] = useState(STICKERS[0])
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const drawing = useRef<Stroke | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const resizeEdge = useRef<ResizeEdge | null>(null)
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 })

  const saveItems = (next: CanvasItem[]) => updateAttributes({ items: JSON.stringify(next) })
  const saveStrokes = (next: Stroke[]) => updateAttributes({ strokes: JSON.stringify(next) })
  const addItem = (item: Omit<CanvasItem, 'id'>) => {
    const id = crypto.randomUUID()
    saveItems([...items, { ...item, id } as CanvasItem])
    setSelectedId(id)
  }

  const deleteSelected = () => {
    if (!selectedId) return
    saveItems(items.filter(item => item.id !== selectedId))
    setSelectedId(null)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!selectedId) return
      if (!wrapperRef.current?.contains(document.activeElement)) return
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      const target = event.target as HTMLElement | null
      if (target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT') return
      event.preventDefault()
      deleteSelected()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedId, items])

  const placeAtPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.round(event.clientX - rect.left))
    const y = Math.max(0, Math.round(event.clientY - rect.top))
    if (tool === 'placeArrow') {
      addItem({ type: 'arrow', x, y, arrow: activeArrow })
      setTool('select')
      return true
    }
    if (tool === 'placeSticker') {
      addItem({ type: 'sticker', x, y, text: activeSticker })
      setTool('select')
      return true
    }
    return false
  }

  const startDraw = (event: React.PointerEvent<HTMLDivElement>) => {
    setSelectedId(null)
    if (placeAtPointer(event)) return
    if (tool === 'select') return
    const rect = event.currentTarget.getBoundingClientRect()
    const point: [number, number] = [event.clientX - rect.left, event.clientY - rect.top]
    if (tool === 'erase') {
      saveStrokes(strokes.filter(stroke => !stroke.points.some(([x, y]) => Math.hypot(x - point[0], y - point[1]) < 18)))
      return
    }
    drawing.current = {
      id: crypto.randomUUID(),
      color: tool === 'highlight' ? 'rgba(255,214,10,0.42)' : '#f5f5f7',
      width: tool === 'highlight' ? 16 : 3,
      points: [point],
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const continueDraw = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drawing.current) return
    const rect = event.currentTarget.getBoundingClientRect()
    drawing.current = {
      ...drawing.current,
      points: [...drawing.current.points, [event.clientX - rect.left, event.clientY - rect.top]],
    }
    saveStrokes([...strokes.filter(stroke => stroke.id !== drawing.current!.id), drawing.current])
  }

  const beginResize = (event: React.PointerEvent<HTMLButtonElement>, edge: ResizeEdge) => {
    event.preventDefault()
    event.stopPropagation()
    resizeEdge.current = edge
    resizeStart.current = {
      x: event.clientX,
      y: event.clientY,
      width: event.currentTarget.closest('.free-canvas-block')?.getBoundingClientRect().width ?? width,
      height,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const resizeCanvas = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!resizeEdge.current) return
    const next: Record<string, number> = {}
    if (resizeEdge.current === 'bottom' || resizeEdge.current === 'corner') {
      next.height = Math.max(260, Math.min(1200, Math.round(resizeStart.current.height + event.clientY - resizeStart.current.y)))
    }
    if (resizeEdge.current === 'right' || resizeEdge.current === 'corner') {
      next.width = Math.max(420, Math.min(1600, Math.round(resizeStart.current.width + event.clientX - resizeStart.current.x)))
    }
    updateAttributes(next)
  }

  const endResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    resizeEdge.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const renderArrow = (kind: ArrowKind) => {
    const config = ARROWS.find(item => item.key === kind) ?? ARROWS[0]
    return <span>{config.symbol}</span>
  }

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      className={`free-canvas-block ${selected ? 'is-selected' : ''}`}
      style={width ? { width } : undefined}
      contentEditable={false}
      tabIndex={0}
    >
      <div className="free-canvas-toolbar">
        <button className={tool === 'select' ? 'active' : ''} onClick={() => setTool('select')} title="Select"><MousePointer2 size={13} /></button>
        <button className={tool === 'pen' ? 'active' : ''} onClick={() => setTool('pen')} title="Pen"><PenLine size={13} /></button>
        <button className={tool === 'highlight' ? 'active' : ''} onClick={() => setTool('highlight')} title="Highlighter"><Highlighter size={13} /></button>
        <button className={tool === 'erase' ? 'active' : ''} onClick={() => setTool('erase')} title="Eraser"><Eraser size={13} /></button>
        <span />
        <button onClick={() => addItem({ type: 'text', x: 40, y: 44, text: 'Text box' })} title="Add text"><Type size={13} /></button>
        <div className="canvas-picker-anchor">
          <button
            className={tool === 'placeSticker' ? 'active' : ''}
            onClick={() => setTool('placeSticker')}
            onDoubleClick={() => setStickerPickerOpen(value => !value)}
            title="Emoji: click to place, double-click to choose"
          >
            <Smile size={13} />
          </button>
          {stickerPickerOpen && (
            <div className="canvas-picker-popover">
              {STICKERS.map(sticker => (
                <button key={sticker} className={activeSticker === sticker ? 'active' : ''} onClick={() => { setActiveSticker(sticker); setStickerPickerOpen(false); setTool('placeSticker') }}>
                  {sticker}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="canvas-picker-anchor">
          <button
            className={tool === 'placeArrow' ? 'active' : ''}
            onClick={() => setTool('placeArrow')}
            onDoubleClick={() => setArrowPickerOpen(value => !value)}
            title="Arrow: click to place, double-click to choose"
          >
            <ArrowRight size={13} />
          </button>
          {arrowPickerOpen && (
            <div className="canvas-picker-popover arrow-picker">
              {ARROWS.map(({ key, symbol, label }) => (
                <button key={key} className={activeArrow === key ? 'active' : ''} onClick={() => { setActiveArrow(key); setArrowPickerOpen(false); setTool('placeArrow') }} title={label}>
                  {symbol}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => fileInputRef.current?.click()} title="Add image"><Image size={13} /></button>
        {selectedId && (
          <button onClick={deleteSelected} title="Delete selected object">
            <Trash2 size={13} />
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={event => {
            const file = event.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = () => addItem({ type: 'image', x: 60, y: 60, src: reader.result as string, width: 240 })
            reader.readAsDataURL(file)
            event.target.value = ''
          }}
        />
      </div>
      <div
        className={`free-canvas-surface tool-${tool}`}
        style={{ height }}
        onPointerDown={startDraw}
        onPointerMove={continueDraw}
        onPointerUp={() => { drawing.current = null }}
      >
        <svg className="free-canvas-drawing" width="100%" height="100%">
          {strokes.map(stroke => (
            <polyline
              key={stroke.id}
              points={stroke.points.map(point => point.join(',')).join(' ')}
              fill="none"
              stroke={stroke.color}
              strokeWidth={stroke.width}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
        {items.map(item => (
          <div
            key={item.id}
            className={`canvas-item canvas-item-${item.type} ${selectedId === item.id ? 'selected' : ''}`}
            style={{ left: item.x, top: item.y, width: item.type === 'image' ? item.width : undefined }}
            onPointerDown={event => {
              if (tool !== 'select') return
              event.stopPropagation()
              wrapperRef.current?.focus()
              setSelectedId(item.id)
              setDragId(item.id)
              setDragStart({ x: event.clientX, y: event.clientY, itemX: item.x, itemY: item.y })
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={event => {
              if (dragId !== item.id) return
              saveItems(items.map(candidate => candidate.id === item.id
                ? { ...candidate, x: Math.max(0, dragStart.itemX + event.clientX - dragStart.x), y: Math.max(0, dragStart.itemY + event.clientY - dragStart.y) } as CanvasItem
                : candidate))
            }}
            onPointerUp={() => setDragId(null)}
            onDoubleClick={event => {
              event.stopPropagation()
              if (item.type === 'text') return
              saveItems(items.filter(candidate => candidate.id !== item.id))
            }}
          >
            {item.type === 'text' && (
              <textarea
                value={item.text}
                onChange={event => saveItems(items.map(candidate => candidate.id === item.id ? { ...item, text: event.target.value } : candidate))}
              />
            )}
            {item.type === 'sticker' && <span>{item.text}</span>}
            {item.type === 'arrow' && renderArrow(item.arrow)}
            {item.type === 'image' && <img src={item.src} alt="" draggable={false} />}
          </div>
        ))}
      </div>
      <button className="canvas-resize-handle canvas-resize-bottom" onPointerDown={event => beginResize(event, 'bottom')} onPointerMove={resizeCanvas} onPointerUp={endResize} title="Drag to make canvas taller" />
      <button className="canvas-resize-handle canvas-resize-right" onPointerDown={event => beginResize(event, 'right')} onPointerMove={resizeCanvas} onPointerUp={endResize} title="Drag to make canvas wider" />
      <button className="canvas-resize-handle canvas-resize-corner" onPointerDown={event => beginResize(event, 'corner')} onPointerMove={resizeCanvas} onPointerUp={endResize} title="Drag to resize canvas" />
    </NodeViewWrapper>
  )
}

export const FreeCanvasBlock = Node.create({
  name: 'freeCanvas',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      items: { default: '[]' },
      strokes: { default: '[]' },
      height: { default: 420 },
      width: { default: 0 },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="free-canvas"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'free-canvas' })]
  },

  addCommands() {
    return {
      insertFreeCanvas: () => ({ commands }) => commands.insertContent({ type: this.name }),
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(FreeCanvasView)
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    freeCanvas: {
      insertFreeCanvas: () => ReturnType
    }
  }
}
