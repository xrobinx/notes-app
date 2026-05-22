import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Plus } from 'lucide-react'
import './TableGrowControls.css'

interface Props {
  editor: Editor
  container: HTMLDivElement | null
}

interface TableRect {
  top: number
  left: number
  width: number
  height: number
}

export function TableGrowControls({ editor, container }: Props) {
  const [rect, setRect] = useState<TableRect | null>(null)
  const [previewControl, setPreviewControl] = useState<'column' | 'row' | null>(null)
  const [armedControl, setArmedControl] = useState<'column' | 'row' | null>(null)
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rectRef = useRef<TableRect | null>(null)
  const rectRaf = useRef<number | null>(null)

  const clearTimers = () => {
    if (previewTimer.current) {
      clearTimeout(previewTimer.current)
      previewTimer.current = null
    }
    if (armTimer.current) {
      clearTimeout(armTimer.current)
      armTimer.current = null
    }
  }

  const armAfterPause = (control: 'column' | 'row') => {
    clearTimers()
    setPreviewControl(null)
    setArmedControl(null)
    previewTimer.current = setTimeout(() => {
      setPreviewControl(control)
      previewTimer.current = null
    }, 50)
    armTimer.current = setTimeout(() => {
      setArmedControl(control)
      armTimer.current = null
    }, 350)
  }

  const disarm = () => {
    clearTimers()
    setPreviewControl(null)
    setArmedControl(null)
  }

  const setMeasuredRect = (next: TableRect | null) => {
    const current = rectRef.current
    if (
      current === next
      || (current && next
        && Math.abs(current.top - next.top) < 0.5
        && Math.abs(current.left - next.left) < 0.5
        && Math.abs(current.width - next.width) < 0.5
        && Math.abs(current.height - next.height) < 0.5)
    ) return
    rectRef.current = next
    setRect(next)
  }

  const updateRectNow = useCallback(() => {
    if (!container || !editor.isActive('table')) {
      setMeasuredRect(null)
      return
    }

    const cell = container.querySelector('.selectedCell') as HTMLElement | null
    const focusedCell = cell ?? (editor.view.domAtPos(editor.state.selection.from).node as HTMLElement | null)
      ?.closest?.('td, th') as HTMLElement | null
    const table = focusedCell?.closest('table') as HTMLTableElement | null

    if (!table) {
      setMeasuredRect(null)
      return
    }

    const tableRect = table.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()

    setMeasuredRect({
      top: tableRect.top - containerRect.top + container.scrollTop,
      left: tableRect.left - containerRect.left + container.scrollLeft,
      width: tableRect.width,
      height: tableRect.height,
    })
  }, [container, editor])

  const updateRect = useCallback(() => {
    if (rectRaf.current !== null) return
    rectRaf.current = requestAnimationFrame(() => {
      rectRaf.current = null
      updateRectNow()
    })
  }, [updateRectNow])

  useEffect(() => {
    updateRectNow()
    editor.on('selectionUpdate', updateRect)
    editor.on('transaction', updateRect)
    window.addEventListener('resize', updateRect)
    container?.addEventListener('scroll', updateRect)

    return () => {
      clearTimers()
      if (rectRaf.current !== null) cancelAnimationFrame(rectRaf.current)
      editor.off('selectionUpdate', updateRect)
      editor.off('transaction', updateRect)
      window.removeEventListener('resize', updateRect)
      container?.removeEventListener('scroll', updateRect)
    }
  }, [container, editor, updateRect])

  if (!rect) return null

  return (
    <div className="table-grow-layer" contentEditable={false}>
      <button
        className={`table-grow-control table-grow-control--column ${previewControl === 'column' ? 'is-previewed' : ''} ${armedControl === 'column' ? 'is-armed' : ''}`}
        style={{
          top: rect.top,
          left: rect.left + rect.width + 5,
          height: rect.height,
        }}
        onMouseEnter={() => armAfterPause('column')}
        onMouseLeave={disarm}
        onMouseDown={event => event.preventDefault()}
        onClick={() => {
          if (armedControl !== 'column') return
          editor.chain().focus().addColumnAfter().run()
          disarm()
        }}
        title="Add column"
      >
        <Plus size={14} />
      </button>
      <button
        className={`table-grow-control table-grow-control--row ${previewControl === 'row' ? 'is-previewed' : ''} ${armedControl === 'row' ? 'is-armed' : ''}`}
        style={{
          top: rect.top + rect.height + 5,
          left: rect.left,
          width: rect.width,
        }}
        onMouseEnter={() => armAfterPause('row')}
        onMouseLeave={disarm}
        onMouseDown={event => event.preventDefault()}
        onClick={() => {
          if (armedControl !== 'row') return
          editor.chain().focus().addRowAfter().run()
          disarm()
        }}
        title="Add row"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}
