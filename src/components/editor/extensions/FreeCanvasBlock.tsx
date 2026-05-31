import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import {
  Circle,
  Eraser,
  Highlighter,
  MousePointer2,
  PenLine,
  Pencil,
  RotateCcw,
  RotateCw,
  Trash2,
} from 'lucide-react'

type SketchTool = 'select' | 'pen' | 'pencil' | 'marker' | 'eraser'
type Stroke = {
  id: string
  color: string
  width: number
  opacity?: number
  points: [number, number][]
}

const COLORS = ['#f5f5f7', '#ffd60a', '#ff453a', '#32d74b', '#64d2ff', '#0a84ff', '#bf5af2', '#ff9f0a']
const DEFAULT_HEIGHT = 420
const MIN_HEIGHT = 260
const MAX_HEIGHT = 8000

function parseStrokes(value: unknown): Stroke[] {
  if (Array.isArray(value)) return normalizeStrokes(value as Stroke[])
  if (typeof value !== 'string') return []
  try { return normalizeStrokes(JSON.parse(value) as Stroke[]) } catch { return [] }
}

function normalizeStrokes(strokes: Stroke[]): Stroke[] {
  return strokes
    .filter(stroke => Array.isArray(stroke.points) && stroke.points.length > 0)
    .map(stroke => ({
      id: stroke.id || crypto.randomUUID(),
      color: stroke.color || '#f5f5f7',
      width: Number(stroke.width || 3),
      opacity: typeof stroke.opacity === 'number' ? stroke.opacity : 1,
      points: stroke.points,
    }))
}

function pointerPoint(event: PointerEvent<HTMLElement>, surface: HTMLElement): [number, number] {
  const rect = surface.getBoundingClientRect()
  return [
    Math.max(0, Math.round(event.clientX - rect.left)),
    Math.max(0, Math.round(event.clientY - rect.top)),
  ]
}

function distanceToSegment(point: [number, number], a: [number, number], b: [number, number]) {
  const [px, py] = point
  const [ax, ay] = a
  const [bx, by] = b
  const dx = bx - ax
  const dy = by - ay
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function strokeHitTest(stroke: Stroke, point: [number, number], radius = 12) {
  if (stroke.points.length === 1) return Math.hypot(stroke.points[0][0] - point[0], stroke.points[0][1] - point[1]) < radius
  for (let i = 1; i < stroke.points.length; i += 1) {
    if (distanceToSegment(point, stroke.points[i - 1], stroke.points[i]) <= Math.max(radius, stroke.width / 2 + 6)) return true
  }
  return false
}

function pointInPolygon(point: [number, number], polygon: [number, number][]) {
  let inside = false
  const [x, y] = point
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function getStrokePreset(tool: SketchTool, color: string, size: number): Pick<Stroke, 'color' | 'width' | 'opacity'> {
  if (tool === 'marker') return { color, width: Math.max(10, size * 4), opacity: 0.38 }
  if (tool === 'pencil') return { color, width: Math.max(1, size - 1), opacity: 0.7 }
  return { color, width: size, opacity: 1 }
}

function translateStroke(stroke: Stroke, dx: number, dy: number): Stroke {
  return { ...stroke, points: stroke.points.map(([x, y]) => [Math.max(0, x + dx), Math.max(0, y + dy)]) }
}

function FreeCanvasView({ node, selected, updateAttributes, editor, deleteNode, getPos }: NodeViewProps) {
  const parsedStrokes = useMemo(() => parseStrokes(node.attrs.strokes), [node.attrs.strokes])
  const attrHeight = Number(node.attrs.height || DEFAULT_HEIGHT)
  const [strokes, setStrokes] = useState<Stroke[]>(parsedStrokes)
  const [height, setHeight] = useState(attrHeight)
  const [tool, setTool] = useState<SketchTool>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [size, setSize] = useState(3)
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<string[]>([])
  const [lassoPoints, setLassoPoints] = useState<[number, number][]>([])
  const strokesRef = useRef(strokes)
  const heightRef = useRef(height)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const activeStroke = useRef<Stroke | null>(null)
  const isErasing = useRef(false)
  const isLassoing = useRef(false)
  const moveStart = useRef<{ point: [number, number]; strokes: Stroke[]; selectedIds: string[] } | null>(null)
  const resizeStart = useRef<{ y: number; height: number } | null>(null)
  const lassoRef = useRef<[number, number][]>([])
  const historyStart = useRef<Stroke[] | null>(null)
  const undoStack = useRef<Stroke[][]>([])
  const redoStack = useRef<Stroke[][]>([])

  useEffect(() => {
    strokesRef.current = parsedStrokes
    setStrokes(parsedStrokes)
  }, [parsedStrokes])

  useEffect(() => {
    heightRef.current = attrHeight
    setHeight(attrHeight)
  }, [attrHeight])

  const stageStrokes = (next: Stroke[]) => {
    strokesRef.current = next
    setStrokes(next)
  }

  const stageHeight = (next: number) => {
    const clamped = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(next)))
    heightRef.current = clamped
    setHeight(clamped)
  }

  const commit = (nextStrokes = strokesRef.current, nextHeight = heightRef.current) => {
    if (historyStart.current) {
      undoStack.current = [...undoStack.current.slice(-39), historyStart.current]
      redoStack.current = []
      historyStart.current = null
    }
    updateAttributes({ strokes: JSON.stringify(nextStrokes), height: nextHeight })
  }

  const startHistory = () => {
    if (!historyStart.current) historyStart.current = strokesRef.current
  }

  const selectBlock = () => {
    wrapperRef.current?.focus()
    if (typeof getPos === 'function') {
      try { editor.chain().focus().setNodeSelection(getPos()).run() } catch { editor.commands.focus() }
    }
  }

  const deleteSelectedStrokes = () => {
    if (selectedStrokeIds.length === 0) return false
    startHistory()
    const selected = new Set(selectedStrokeIds)
    const next = strokesRef.current.filter(stroke => !selected.has(stroke.id))
    setSelectedStrokeIds([])
    stageStrokes(next)
    commit(next)
    return true
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!wrapperRef.current?.contains(document.activeElement)) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        const previous = undoStack.current.pop()
        if (!previous) return
        redoStack.current.push(strokesRef.current)
        stageStrokes(previous)
        updateAttributes({ strokes: JSON.stringify(previous), height: heightRef.current })
        return
      }
      if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) {
        event.preventDefault()
        const next = redoStack.current.pop()
        if (!next) return
        undoStack.current.push(strokesRef.current)
        stageStrokes(next)
        updateAttributes({ strokes: JSON.stringify(next), height: heightRef.current })
        return
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      event.preventDefault()
      if (!deleteSelectedStrokes()) deleteNode()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deleteNode, selectedStrokeIds, updateAttributes])

  const autoGrow = (point: [number, number]) => {
    if (point[1] < heightRef.current - 56) return
    stageHeight(point[1] + 180)
  }

  const eraseAt = (point: [number, number]) => {
    const next = strokesRef.current.filter(stroke => !strokeHitTest(stroke, point, 10))
    if (next.length !== strokesRef.current.length) stageStrokes(next)
  }

  const startSketch = (event: PointerEvent<HTMLDivElement>) => {
    selectBlock()
    const point = pointerPoint(event, event.currentTarget)
    if (tool === 'select') {
      const hit = [...strokesRef.current].reverse().find(stroke => strokeHitTest(stroke, point))
      if (hit) {
        const ids = selectedStrokeIds.includes(hit.id) ? selectedStrokeIds : [hit.id]
        setSelectedStrokeIds(ids)
        moveStart.current = { point, strokes: strokesRef.current, selectedIds: ids }
        startHistory()
      } else {
        setSelectedStrokeIds([])
        isLassoing.current = true
        lassoRef.current = [point]
        setLassoPoints(lassoRef.current)
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    setSelectedStrokeIds([])
    startHistory()
    if (tool === 'eraser') {
      isErasing.current = true
      eraseAt(point)
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    const preset = getStrokePreset(tool, color, size)
    activeStroke.current = { id: crypto.randomUUID(), ...preset, points: [point] }
    stageStrokes([...strokesRef.current, activeStroke.current])
    autoGrow(point)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const continueSketch = (event: PointerEvent<HTMLDivElement>) => {
    const point = pointerPoint(event, event.currentTarget)
    if (resizeStart.current) return
    if (moveStart.current) {
      const selected = new Set(moveStart.current.selectedIds)
      const dx = point[0] - moveStart.current.point[0]
      const dy = point[1] - moveStart.current.point[1]
      stageStrokes(moveStart.current.strokes.map(stroke => selected.has(stroke.id) ? translateStroke(stroke, dx, dy) : stroke))
      autoGrow(point)
      return
    }
    if (isLassoing.current) {
      lassoRef.current = [...lassoRef.current, point]
      setLassoPoints(lassoRef.current)
      return
    }
    if (isErasing.current) {
      eraseAt(point)
      return
    }
    if (!activeStroke.current) return
    const last = activeStroke.current.points.at(-1)
    if (last && Math.hypot(last[0] - point[0], last[1] - point[1]) < 2) return
    activeStroke.current = { ...activeStroke.current, points: [...activeStroke.current.points, point] }
    stageStrokes([...strokesRef.current.filter(stroke => stroke.id !== activeStroke.current?.id), activeStroke.current])
    autoGrow(point)
  }

  const finishSketch = (event: PointerEvent<HTMLDivElement>) => {
    if (isLassoing.current) {
      const selectedIds = strokesRef.current
        .filter(stroke => stroke.points.some(point => pointInPolygon(point, lassoRef.current)))
        .map(stroke => stroke.id)
      setSelectedStrokeIds(selectedIds)
      lassoRef.current = []
      setLassoPoints([])
    }
    if (activeStroke.current || isErasing.current || moveStart.current) commit()
    activeStroke.current = null
    isErasing.current = false
    isLassoing.current = false
    moveStart.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const undo = () => {
    const previous = undoStack.current.pop()
    if (!previous) return
    redoStack.current.push(strokesRef.current)
    stageStrokes(previous)
    updateAttributes({ strokes: JSON.stringify(previous), height: heightRef.current })
  }

  const redo = () => {
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push(strokesRef.current)
    stageStrokes(next)
    updateAttributes({ strokes: JSON.stringify(next), height: heightRef.current })
  }

  const clearSketch = () => {
    if (strokesRef.current.length === 0) return
    startHistory()
    setSelectedStrokeIds([])
    stageStrokes([])
    commit([])
  }

  const beginResize = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    selectBlock()
    resizeStart.current = { y: event.clientY, height: heightRef.current }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const resize = (event: PointerEvent<HTMLButtonElement>) => {
    if (!resizeStart.current) return
    stageHeight(resizeStart.current.height + event.clientY - resizeStart.current.y)
  }

  const endResize = (event: PointerEvent<HTMLButtonElement>) => {
    if (!resizeStart.current) return
    resizeStart.current = null
    updateAttributes({ height: heightRef.current, strokes: JSON.stringify(strokesRef.current) })
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const selectedSet = new Set(selectedStrokeIds)

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      className={`free-canvas-block sketch-block ${selected ? 'is-selected' : ''}`}
      contentEditable={false}
      tabIndex={0}
      onClick={selectBlock}
    >
      <div className="free-canvas-toolbar sketch-toolbar">
        <button className={tool === 'select' ? 'active' : ''} onClick={() => setTool('select')} title="Select strokes"><MousePointer2 size={13} /></button>
        <button className={tool === 'pen' ? 'active' : ''} onClick={() => setTool('pen')} title="Pen"><PenLine size={13} /></button>
        <button className={tool === 'pencil' ? 'active' : ''} onClick={() => setTool('pencil')} title="Pencil"><Pencil size={13} /></button>
        <button className={tool === 'marker' ? 'active' : ''} onClick={() => setTool('marker')} title="Marker"><Highlighter size={13} /></button>
        <button className={tool === 'eraser' ? 'active' : ''} onClick={() => setTool('eraser')} title="Eraser"><Eraser size={13} /></button>
        <div className="sketch-color-row">
          {COLORS.map(swatch => (
            <button
              key={swatch}
              className={`sketch-color ${color === swatch ? 'active' : ''}`}
              style={{ background: swatch }}
              onClick={() => setColor(swatch)}
              title={swatch}
            />
          ))}
        </div>
        <label className="sketch-size-control" title="Stroke size">
          <Circle size={10} />
          <input type="range" min="1" max="9" value={size} onChange={event => setSize(Number(event.target.value))} />
        </label>
        <span />
        <button onClick={undo} title="Undo sketch stroke"><RotateCcw size={13} /></button>
        <button onClick={redo} title="Redo sketch stroke"><RotateCw size={13} /></button>
        <button onClick={clearSketch} title="Clear sketch"><Trash2 size={13} /></button>
      </div>
      <div
        ref={surfaceRef}
        className={`free-canvas-surface sketch-surface tool-${tool}`}
        style={{ height }}
        onPointerDown={startSketch}
        onPointerMove={continueSketch}
        onPointerUp={finishSketch}
        onPointerCancel={finishSketch}
      >
        <svg className="free-canvas-drawing sketch-drawing" width="100%" height="100%">
          {strokes.map(stroke => (
            <polyline
              key={stroke.id}
              className={selectedSet.has(stroke.id) ? 'is-selected-stroke' : ''}
              points={stroke.points.map(point => point.join(',')).join(' ')}
              fill="none"
              stroke={stroke.color}
              strokeOpacity={stroke.opacity ?? 1}
              strokeWidth={stroke.width}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {lassoPoints.length > 1 && (
            <polyline
              className="sketch-lasso"
              points={lassoPoints.map(point => point.join(',')).join(' ')}
              fill="none"
            />
          )}
        </svg>
      </div>
      <button
        className="canvas-resize-handle canvas-resize-bottom sketch-resize-bottom"
        onPointerDown={beginResize}
        onPointerMove={resize}
        onPointerUp={endResize}
        title="Drag to resize sketch"
      />
    </NodeViewWrapper>
  )
}

export const FreeCanvasBlock = Node.create({
  name: 'freeCanvas',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      items: { default: '[]' },
      strokes: { default: '[]' },
      height: { default: DEFAULT_HEIGHT },
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
