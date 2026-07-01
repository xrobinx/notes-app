import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Folder, Menu, Plus, Search, Settings, Sparkles } from 'lucide-react'
import { EditorPanel } from '../components/layout/EditorPanel'
import { OnboardingModal } from '../components/modals/OnboardingModal'
import { SettingsModal } from '../components/modals/SettingsModal'
import { useFoldersStore } from '../store/foldersStore'
import { useNotesStore } from '../store/notesStore'
import { useSettingsStore } from '../store/settingsStore'
import type { Note } from '../types'
import './MobileApp.css'

type MobileScreen = 'folders' | 'notes' | 'editor'

export function MobileApp() {
  const settings = useSettingsStore()
  const { folders, selectedFolderId, load: loadFolders, selectFolder } = useFoldersStore()
  const { notes, selectedNoteId, loadNotes, createNote, selectNote } = useNotesStore()
  const [screen, setScreen] = useState<MobileScreen>('notes')
  const [query, setQuery] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const selectedNote = notes.find(note => note.id === selectedNoteId) ?? null

  useEffect(() => {
    async function init() {
      await settings.load()
      await loadFolders()
      await loadNotes(null)
    }
    void init()
  }, [])

  useEffect(() => {
    if (!selectedNoteId && notes.length) selectNote(notes[0].id)
  }, [notes.length, selectedNoteId])

  useEffect(() => {
    const openNote = (event: Event) => {
      const id = (event as CustomEvent<string>).detail
      selectNote(id)
      setScreen('editor')
    }
    window.addEventListener('notes-mobile-open-note', openNote)
    return () => window.removeEventListener('notes-mobile-open-note', openNote)
  }, [selectNote])

  useEffect(() => {
    const handleUrl = async (event: Event) => {
      const url = (event as CustomEvent<string>).detail
      const parsed = new URL(url)
      if (parsed.protocol !== 'notesapp:') return
      if (parsed.host === 'quick-note') {
        const text = parsed.searchParams.get('text') ?? ''
        const note = await createNote(null)
        if (text.trim()) {
          await window.api.notes.update(note.id, {
            body: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }),
            plainText: text,
          })
        }
        selectNote(note.id)
        await loadNotes(null)
        setScreen('editor')
      } else if (parsed.host === 'open') {
        setScreen(parsed.pathname.includes('quickCapture') ? 'editor' : 'notes')
      }
    }
    window.addEventListener('notes-mobile-url-open', handleUrl)
    return () => window.removeEventListener('notes-mobile-url-open', handleUrl)
  }, [createNote, loadNotes, selectNote])

  const filteredNotes = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return notes
    return notes.filter(note => `${note.title} ${note.plainText}`.toLowerCase().includes(needle))
  }, [notes, query])

  const greetingName = settings.nickname?.trim()
  const greeting = getGreeting()

  const openFolder = async (folderId: string | null) => {
    selectFolder(folderId)
    await loadNotes(folderId)
    setScreen('notes')
  }

  const makeNote = async () => {
    const note = await createNote(selectedFolderId === 'trash' ? null : selectedFolderId)
    selectNote(note.id)
    setScreen('editor')
  }

  return (
    <div className="mobile-app">
      <header className="mobile-topbar">
        <button className="mobile-icon-btn mobile-menu-btn" onClick={() => setScreen(screen === 'folders' ? 'notes' : 'folders')} aria-label="Folders">
          <Menu size={19} />
        </button>
        <div className="mobile-greeting">
          <span>{greeting}{greetingName ? ',' : ''}</span>
          {greetingName && <strong>{greetingName}</strong>}
        </div>
        <button className="mobile-icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings">
          <Settings size={18} />
        </button>
      </header>

      <main className={`mobile-grid mobile-screen-${screen}`}>
        <aside className="mobile-pane mobile-folders">
          <div className="mobile-section-title">Library</div>
          <button className={`mobile-folder-row ${selectedFolderId === null ? 'active' : ''}`} onClick={() => void openFolder(null)}>
            <Sparkles size={17} /> All Notes
          </button>
          {folders.map(folder => (
            <button
              key={folder.id}
              className={`mobile-folder-row ${selectedFolderId === folder.id ? 'active' : ''}`}
              onClick={() => void openFolder(folder.id)}
            >
              <Folder size={17} /> {folder.name}
            </button>
          ))}
        </aside>

        <section className="mobile-pane mobile-notes">
          <div className="mobile-notes-header">
            <button className="mobile-back-btn" onClick={() => setScreen('folders')}>
              <ChevronLeft size={16} /> Folders
            </button>
            <button className="mobile-new-note-btn" onClick={() => void makeNote()}>
              <Plus size={16} /> New
            </button>
          </div>
          <label className="mobile-search">
            <Search size={15} />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search notes" />
          </label>
          <div className="mobile-note-list">
            {filteredNotes.map(note => (
              <MobileNoteRow
                key={note.id}
                note={note}
                active={note.id === selectedNoteId}
                onSelect={() => {
                  selectNote(note.id)
                  setScreen('editor')
                }}
              />
            ))}
          </div>
        </section>

        <section className="mobile-pane mobile-editor">
          <div className="mobile-editor-back">
            <button className="mobile-back-btn" onClick={() => setScreen('notes')}>
              <ChevronLeft size={16} /> Notes
            </button>
            <button className="mobile-new-note-btn" onClick={() => void makeNote()}>
              <Plus size={16} /> New
            </button>
          </div>
          <EditorPanel searchQuery={query} />
        </section>
      </main>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {settings.loaded && !settings.hasCompletedOnboarding && !notes.length && <OnboardingModal />}
    </div>
  )
}

function MobileNoteRow({ note, active, onSelect }: { note: Note; active: boolean; onSelect: () => void }) {
  return (
    <button className={`mobile-note-row ${active ? 'active' : ''}`} onClick={onSelect}>
      <span className="mobile-note-emoji">{note.emoji}</span>
      <span className="mobile-note-body">
        <strong>{note.title || 'New Note'}</strong>
        <span>{note.plainText || 'No additional text'}</span>
      </span>
      {note.isLocked === 1 && <span className="mobile-note-lock">Locked</span>}
    </button>
  )
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}
