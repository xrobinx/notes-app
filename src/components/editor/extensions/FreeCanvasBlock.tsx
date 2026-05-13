import { useRef, useState } from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { ArrowRight, Eraser, Highlighter, Image, MousePointer2, PenLine, Plus, Smile, Type } from 'lucide-react'

type CanvasItem =
  | { id: string; type: 'text'; x: number; y: number; text: string }
  | { id: string; type: 'sticker'; x: number; y: number; text: string }
  | { id: string; type: 'arrow'; x: number; y: number }
  | { id: string; type: 'image'; x: number; y: number; src: string; width: number }

type Stroke = { id: string; color: string; width: number; points: [number, number][] }
type Tool = 'select' | 'pen' | 'highlight' | 'erase'

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
  const [tool, setTool] = useState<Tool>('select')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, itemX: 0, itemY: 0 })
  const drawing = useRef<Stroke | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const saveItems = (next: CanvasItem[]) => updateAttributes({ items: JSON.stringify(next) })
  const saveStrokes = (next: Stroke[]) => updateAttributes({ strokes: JSON.stringify(next) })
  const addItem = (item: Omit<CanvasItem, 'id'>) => saveItems([...items, { ...item, id: crypto.randomUUID() } as CanvasItem])

  const startDraw = (event: React.PointerEvent<HTMLDivElement>) => {
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

  const endDraw = () => {
    drawing.current = null
  }

  return (
    <NodeViewWrapper className={`free-canvas-block ${selected ? 'is-selected' : ''}`} contentEditable={false}>
      <div className="free-canvas-toolbar">
        <button className={tool === 'select' ? 'active' : ''} onClick={() => setTool('select')} title="Select"><MousePointer2 size={13} /></button>
        <button className={tool === 'pen' ? 'active' : ''} onClick={() => setTool('pen')} title="Pen"><PenLine size={13} /></button>
        <button className={tool === 'highlight' ? 'active' : ''} onClick={() => setTool('highlight')} title="Highlighter"><Highlighter size={13} /></button>
        <button className={tool === 'erase' ? 'active' : ''} onClick={() => setTool('erase')} title="Eraser"><Eraser size={13} /></button>
        <span />
        <button onClick={() => addItem({ type: 'text', x: 40, y: 44, text: 'Text box' })} title="Add text"><Type size={13} /></button>
        <button onClick={() => addItem({ type: 'sticker', x: 82, y: 88, text: '⭐' })} title="Add sticker"><Smile size={13} /></button>
        <button onClick={() => addItem({ type: 'arrow', x: 128, y: 120 })} title="Add arrow"><ArrowRight size={13} /></button>
        <button onClick={() => fileInputRef.current?.click()} title="Add image"><Image size={13} /></button>
        <button onClick={() => updateAttributes({ height: Math.min(900, height + 120) })} title="Make canvas taller"><Plus size={13} /></button>
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
        onPointerUp={endDraw}
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
            className={`canvas-item canvas-item-${item.type}`}
            style={{ left: item.x, top: item.y, width: item.type === 'image' ? item.width : undefined }}
            onPointerDown={event => {
              if (tool !== 'select') return
              event.stopPropagation()
              setDragId(item.id)
              setDragStart({ x: event.clientX, y: event.clientY, itemX: item.x, itemY: item.y })
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={event => {
              if (dragId !== item.id) return
              const next = items.map(candidate => candidate.id === item.id
                ? { ...candidate, x: Math.max(0, dragStart.itemX + event.clientX - dragStart.x), y: Math.max(0, dragStart.itemY + event.clientY - dragStart.y) } as CanvasItem
                : candidate)
              saveItems(next)
            }}
            onPointerUp={() => setDragId(null)}
            onDoubleClick={() => saveItems(items.filter(candidate => candidate.id !== item.id))}
          >
            {item.type === 'text' && (
              <textarea
                value={item.text}
                onChange={event => saveItems(items.map(candidate => candidate.id === item.id ? { ...item, text: event.target.value } : candidate))}
              />
            )}
            {item.type === 'sticker' && <span>{item.text}</span>}
            {item.type === 'arrow' && <ArrowRight size={74} />}
            {item.type === 'image' && <img src={item.src} alt="" draggable={false} />}
          </div>
        ))}
      </div>
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
