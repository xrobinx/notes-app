import { useEffect, useMemo, useRef, useState } from 'react'
import { generateHTML } from '@tiptap/html'
import { Folder, Plus, Search, LayoutList, LayoutGrid, Trash2, RotateCcw, X } from 'lucide-react'
import { useNotesStore } from '../../store/notesStore'
import { useFoldersStore } from '../../store/foldersStore'
import { NoteCard } from './NoteCard'
import type { Note } from '../../types'
import { editorExtensions } from '../editor/extensions'
import { LockNoteDialog } from '../modals/LockNoteDialog'
import './NoteList.css'

interface Props {
  collapsed: boolean
  onToggle: () => void
  onSearchCleared: () => void
  onSearchResultOpen: (query: string) => void
}

export function NoteList({ collapsed, onToggle, onSearchCleared, onSearchResultOpen }: Props) {
  const { notes, selectedNoteId, unlockedNoteIds, createNote, deleteNote, restoreNote, permanentDeleteNote, emptyTrash, selectNote, pinNote, searchNotesAdvanced, lockNote, lockNoteGlobal, duplicateNote, reorderNotes } = useNotesStore()
  const { selectedFolderId, deletedFolders, loadTrash, restoreFolder, permanentDeleteFolder } = useFoldersStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Note[] | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [noteToLock, setNoteToLock] = useState<Note | null>(null)
  const [searchFilters, setSearchFilters] = useState({ locked: false, attachments: false, checklists: false, dateRange: null as 'today' | 'week' | 'month' | null })
  const [scrollTop, setScrollTop] = useState(0)
  const listBodyRef = useRef<HTMLDivElement | null>(null)
  const isTrash = selectedFolderId === 'trash'
  const rowHeight = 74
  const overscan = 8

  useEffect(() => {
    if (isTrash) void loadTrash()
  }, [isTrash, loadTrash])

  const handleSearch = async (q: string, filters = searchFilters) => {
    setSearchQuery(q)
    if (q.trim().length >= 2) {
      const folderId = typeof selectedFolderId === 'string' && !selectedFolderId.startsWith('smart:') && selectedFolderId !== 'trash' && selectedFolderId !== 'pinned'
        ? selectedFolderId
        : null
      const results = await searchNotesAdvanced(q, { ...filters, folderId })
      setSearchResults(results)
    } else {
      setSearchResults(null)
      onSearchCleared()
    }
  }

  const handleNewNote = async () => {
    const folderId = selectedFolderId === 'trash' || selectedFolderId === 'pinned' ? null : (selectedFolderId as string | null)
    const note = await createNote(folderId)
    selectNote(note.id)
  }

  const displayNotes = searchResults ?? notes
  const [dragOverNoteId, setDragOverNoteId] = useState<string | null>(null)
  const visibleWindow = useMemo(() => {
    if (viewMode === 'grid' || isTrash || displayNotes.length < 120) {
      return { notes: displayNotes, top: 0, bottom: 0 }
    }
    const height = listBodyRef.current?.clientHeight ?? 640
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
    const end = Math.min(displayNotes.length, Math.ceil((scrollTop + height) / rowHeight) + overscan)
    return {
      notes: displayNotes.slice(start, end),
      top: start * rowHeight,
      bottom: Math.max(0, (displayNotes.length - end) * rowHeight),
    }
  }, [displayNotes, isTrash, scrollTop, viewMode])

  const setFilter = async (key: keyof typeof searchFilters, value: boolean | 'today' | 'week' | 'month' | null) => {
    const next = { ...searchFilters, [key]: value }
    setSearchFilters(next)
    if (searchQuery.trim().length >= 2) await handleSearch(searchQuery, next)
  }

  const exportNotePdf = async (note: Note) => {
    try {
      const fullNote = note.bodyLoaded === false ? await window.api.notes.get(note.id) : note
      if (!fullNote) return
      const html = generateHTML(JSON.parse(fullNote.body), editorExtensions)
      await window.api.files.exportNotePdf(fullNote.title, fullNote.emoji, html)
    } catch {
      alert('Could not export this note as PDF.')
    }
  }

  if (collapsed) {
    return (
      <div className="note-list note-list--collapsed">
        <button className="note-list-expand-btn" onClick={onToggle} title="Show notes">
          <LayoutList size={18} />
        </button>
      </div>
    )
  }

  return (
    <div className="note-list">
      {/* Header */}
      <div className="note-list-header">
        <div className="note-list-search">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => { setSearchQuery(''); setSearchResults(null); onSearchCleared() }}>
              <X size={12} />
            </button>
          )}
        </div>

        {searchQuery.trim().length >= 2 && (
          <div className="note-search-filters">
            <button className={searchFilters.locked ? 'active' : ''} onClick={() => setFilter('locked', !searchFilters.locked)}>Locked</button>
            <button className={searchFilters.attachments ? 'active' : ''} onClick={() => setFilter('attachments', !searchFilters.attachments)}>Files</button>
            <button className={searchFilters.checklists ? 'active' : ''} onClick={() => setFilter('checklists', !searchFilters.checklists)}>Checks</button>
            <select value={searchFilters.dateRange ?? ''} onChange={event => setFilter('dateRange', (event.target.value || null) as 'today' | 'week' | 'month' | null)}>
              <option value="">Any date</option>
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
            </select>
          </div>
        )}

        <div className="note-list-actions">
          {!isTrash && (
            <button
              className="note-list-btn"
              onClick={handleNewNote}
              title="New note"
            >
              <Plus size={16} />
            </button>
          )}
          {isTrash && notes.length > 0 && (
            <button
              className="note-list-btn danger"
              onClick={() => { if (confirm('Delete all notes in trash permanently?')) emptyTrash() }}
              title="Empty trash"
            >
              <Trash2 size={15} />
            </button>
          )}
          <button
            className={`note-list-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode(v => v === 'list' ? 'grid' : 'list')}
            title={viewMode === 'list' ? 'Grid view' : 'List view'}
          >
            {viewMode === 'list' ? <LayoutGrid size={15} /> : <LayoutList size={15} />}
          </button>
          <button
            className="note-list-btn"
            onClick={onToggle}
            title="Collapse note list"
            style={{ marginLeft: 'auto' }}
          >
            <LayoutList size={15} />
          </button>
        </div>
      </div>

      {/* Notes */}
      <div
        ref={listBodyRef}
        className={`note-list-body ${viewMode === 'grid' ? 'grid-view' : ''}`}
        onScroll={event => setScrollTop(event.currentTarget.scrollTop)}
      >
        {isTrash && deletedFolders.length > 0 && (
          <div className="deleted-folder-list">
            {deletedFolders.map(folder => (
              <div className="deleted-folder-card" key={folder.id}>
                <Folder size={17} />
                <div>
                  <strong>{folder.name}</strong>
                  <span>
                    {folder.noteCount ?? 0} note{folder.noteCount === 1 ? '' : 's'}
                    {folder.folderCount ? `, ${folder.folderCount} subfolder${folder.folderCount === 1 ? '' : 's'}` : ''}
                  </span>
                </div>
                <button onClick={() => restoreFolder(folder.id)} title="Restore folder and notes">
                  <RotateCcw size={13} />
                </button>
                <button
                  className="deleted-folder-danger"
                  onClick={() => permanentDeleteFolder(folder.id)}
                  title="Delete folder permanently"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        {displayNotes.length === 0 && (!isTrash || deletedFolders.length === 0) ? (
          <div className="note-list-empty">
            {isTrash ? 'Trash is empty' : searchQuery ? 'No results' : 'No notes'}
          </div>
        ) : (
          <>
          {visibleWindow.top > 0 && <div style={{ height: visibleWindow.top }} />}
          {visibleWindow.notes.map(note => (
            <div
              key={note.id}
              className={dragOverNoteId === note.id ? 'note-drop-target' : undefined}
              onDragOver={event => {
                if (event.dataTransfer.types.includes('application/x-note-id')) {
                  event.preventDefault()
                  setDragOverNoteId(note.id)
                }
              }}
              onDragLeave={() => setDragOverNoteId(null)}
              onDrop={async event => {
                const draggedId = event.dataTransfer.getData('application/x-note-id')
                setDragOverNoteId(null)
                if (!draggedId || draggedId === note.id) return
                const ids = displayNotes.map(item => item.id).filter(id => id !== draggedId)
                const index = ids.indexOf(note.id)
                ids.splice(index, 0, draggedId)
                const folderForReorder = typeof selectedFolderId === 'string' && selectedFolderId !== 'trash' && selectedFolderId !== 'pinned'
                  ? selectedFolderId
                  : undefined
                await reorderNotes(ids, folderForReorder)
              }}
            >
              <NoteCard
                note={note}
                isSelected={selectedNoteId === note.id}
                isUnlocked={unlockedNoteIds.includes(note.id)}
                isTrash={isTrash}
                viewMode={viewMode}
                onSelect={() => {
                  selectNote(note.id)
                  if (searchQuery.trim().length >= 2) {
                    onSearchResultOpen(searchQuery)
                  }
                }}
                onPin={() => pinNote(note.id, !note.isPinned)}
                onDelete={() => deleteNote(note.id)}
                onRestore={() => restoreNote(note.id)}
                onPermanentDelete={() => permanentDeleteNote(note.id)}
                onExportPdf={() => exportNotePdf(note)}
                onLock={() => setNoteToLock(note)}
                onDuplicate={async () => {
                  const copy = await duplicateNote(note.id)
                  if (copy) selectNote(copy.id)
                }}
              />
            </div>
          ))}
          {visibleWindow.bottom > 0 && <div style={{ height: visibleWindow.bottom }} />}
          </>
        )}
      </div>
      {noteToLock && (
        <LockNoteDialog
          noteTitle={noteToLock.title}
          onClose={() => setNoteToLock(null)}
          onUseGlobal={() => lockNoteGlobal(noteToLock.id)}
          onUseNew={(passcode) => lockNote(noteToLock.id, passcode)}
        />
      )}
    </div>
  )
}
