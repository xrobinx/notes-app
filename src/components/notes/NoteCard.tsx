import { useState } from 'react'
import { Copy, Download, Lock, Pin, PinOff, Trash2, RotateCcw, X } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { Note } from '../../types'
import './NoteCard.css'

interface Props {
  note: Note
  isSelected: boolean
  isUnlocked: boolean
  isTrash: boolean
  viewMode: 'list' | 'grid'
  onSelect: () => void
  onPin: () => void
  onDelete: () => void
  onRestore: () => void
  onPermanentDelete: () => void
  onExportPdf: () => void
  onLock: () => void
  onDuplicate: () => void
}

export function NoteCard({ note, isSelected, isUnlocked, isTrash, viewMode, onSelect, onPin, onDelete, onRestore, onPermanentDelete, onExportPdf, onLock, onDuplicate }: Props) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const isLockedForView = note.isLocked === 1 && !isUnlocked

  const timeAgo = formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })

  const daysLeft = note.deletedAt
    ? Math.max(0, 30 - Math.floor((Date.now() - new Date(note.deletedAt).getTime()) / 86400000))
    : null

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  return (
    <>
      <div
        className={`note-card ${isSelected ? 'selected' : ''} ${isLockedForView ? 'locked' : ''} ${viewMode}`}
        onClick={onSelect}
        onContextMenu={handleContextMenu}
        draggable={!isTrash}
        onDragStart={event => {
          event.dataTransfer.setData('application/x-note-id', note.id)
          event.dataTransfer.effectAllowed = 'move'
        }}
      >
        <div className="note-card-emoji">{note.emoji}</div>
        <div className="note-card-content">
          <div className="note-card-title">{note.title || 'New Note'}</div>
          {viewMode === 'list' && (
            <div className="note-card-meta">
              <span className="note-card-date">{timeAgo}</span>
              {isLockedForView ? (
                <span className="note-card-preview">Locked note</span>
              ) : note.plainText && (
                <span className="note-card-preview">{note.plainText.slice(0, 80)}</span>
              )}
            </div>
          )}
          {isTrash && daysLeft !== null && (
            <span className="note-card-days-left">{daysLeft}d left</span>
          )}
        </div>
        <div className="note-card-actions">
          {!isTrash && (
            <button
              className="note-card-action-btn"
              onClick={event => {
                event.stopPropagation()
                onExportPdf()
              }}
              title="Export this note as PDF"
            >
              <Download size={12} />
            </button>
          )}
          {note.isPinned === 1 && !isTrash && (
            <Pin size={11} className="note-card-pin-icon" />
          )}
          {note.isLocked === 1 && (
            <Lock size={11} className="note-card-lock-icon" />
          )}
        </div>
      </div>

      {contextMenu && (
        <>
          <div
            className="context-menu scale-in"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            {!isTrash ? (
              <>
                <button onClick={() => { onPin(); setContextMenu(null) }}>
                  {note.isPinned ? <><PinOff size={13} /> Unpin</> : <><Pin size={13} /> Pin</>}
                </button>
                <button onClick={() => { onLock(); setContextMenu(null) }}>
                  <Lock size={13} /> Lock Note
                </button>
                <button onClick={() => { onDuplicate(); setContextMenu(null) }}>
                  <Copy size={13} /> Duplicate
                </button>
                <button onClick={() => { onDelete(); setContextMenu(null) }}>
                  <Trash2 size={13} /> Move to Trash
                </button>
              </>
            ) : (
              <>
                <button onClick={() => { onRestore(); setContextMenu(null) }}>
                  <RotateCcw size={13} /> Restore
                </button>
                <button className="danger" onClick={() => { onPermanentDelete(); setContextMenu(null) }}>
                  <X size={13} /> Delete Permanently
                </button>
              </>
            )}
          </div>
          <div className="context-overlay" onClick={() => setContextMenu(null)} />
        </>
      )}
    </>
  )
}
