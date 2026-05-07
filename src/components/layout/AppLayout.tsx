import { useEffect, useState } from 'react'
import { TitleBar } from './TitleBar'
import { Sidebar } from '../sidebar/Sidebar'
import { NoteList } from '../notes/NoteList'
import { EditorPanel } from './EditorPanel'
import { SettingsModal } from '../modals/SettingsModal'
import { useNotesStore } from '../../store/notesStore'
import { useFoldersStore } from '../../store/foldersStore'
import { useSettingsStore } from '../../store/settingsStore'
import { comboMatchesEvent, getShortcut } from '../../utils/shortcuts'
import './AppLayout.css'

export function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [noteListCollapsed, setNoteListCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editorSearchQuery, setEditorSearchQuery] = useState('')
  const { createNote, selectNote, selectedNoteId, duplicateNote, clearUnlockedNotes, unlockedNoteIds } = useNotesStore()
  const { createFolder, selectedFolderId } = useFoldersStore()
  const settings = useSettingsStore()

  useEffect(() => {
    const onKeyDown = async (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
      const run = (id: string) => comboMatchesEvent(getShortcut(settings.shortcuts, id), event)
      if (run('settings')) {
        event.preventDefault()
        setSettingsOpen(true)
        return
      }
      if (run('newNote')) {
        event.preventDefault()
        const folderId = selectedFolderId === 'trash' || selectedFolderId === 'pinned' ? null : selectedFolderId as string | null
        const note = await createNote(folderId)
        selectNote(note.id)
        return
      }
      if (run('newFolder')) {
        event.preventDefault()
        await createFolder('New Folder', null)
        return
      }
      if (run('duplicateNote') && selectedNoteId) {
        event.preventDefault()
        const copy = await duplicateNote(selectedNoteId)
        if (copy) selectNote(copy.id)
        return
      }
      if (!isTyping && run('search')) {
        event.preventDefault()
        document.querySelector<HTMLInputElement>('.search-input')?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [settings.shortcuts, selectedFolderId, selectedNoteId, createNote, createFolder, duplicateNote, selectNote])

  useEffect(() => {
    if (!settings.autoLockTimeout || unlockedNoteIds.length === 0) return
    let timer: number | null = null
    const armTimer = () => {
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        clearUnlockedNotes()
      }, settings.autoLockTimeout * 60 * 1000)
    }
    const events = ['pointerdown', 'keydown', 'wheel', 'focus'] as const
    events.forEach(eventName => window.addEventListener(eventName, armTimer, true))
    armTimer()
    return () => {
      if (timer) window.clearTimeout(timer)
      events.forEach(eventName => window.removeEventListener(eventName, armTimer, true))
    }
  }, [settings.autoLockTimeout, unlockedNoteIds.length, clearUnlockedNotes])

  return (
    <div className="app-layout">
      <TitleBar />
      <div className="app-body">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(v => !v)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <NoteList
          collapsed={noteListCollapsed}
          onToggle={() => setNoteListCollapsed(v => !v)}
          onSearchCleared={() => setEditorSearchQuery('')}
          onSearchResultOpen={setEditorSearchQuery}
        />
        <EditorPanel searchQuery={editorSearchQuery} />
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
