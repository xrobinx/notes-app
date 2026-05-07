import { create } from 'zustand'
import type { Note, NoteHistoryEntry } from '../types'

interface NotesState {
  notes: Note[]
  selectedNoteId: string | null
  unlockedNoteIds: string[]
  isLoading: boolean
  currentFolderId: string | null | 'trash'

  loadNotes: (folderId?: string | null | 'trash') => Promise<void>
  createNote: (folderId?: string | null) => Promise<Note>
  updateNote: (id: string, patch: Partial<Note>) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  restoreNote: (id: string) => Promise<void>
  permanentDeleteNote: (id: string) => Promise<void>
  emptyTrash: () => Promise<void>
  selectNote: (id: string | null) => void
  pinNote: (id: string, pinned: boolean) => Promise<void>
  searchNotes: (query: string) => Promise<Note[]>
  searchNotesAdvanced: (query: string, filters: { folderId?: string | null; locked?: boolean; attachments?: boolean; checklists?: boolean; dateRange?: 'today' | 'week' | 'month' | null }) => Promise<Note[]>
  getNoteHistory: (id: string) => Promise<NoteHistoryEntry[]>
  restoreNoteHistory: (id: string, historyId: string) => Promise<Note | null>
  setCurrentFolder: (folderId: string | null | 'trash') => void
  lockNote: (id: string, password: string) => Promise<void>
  lockNoteGlobal: (id: string) => Promise<void>
  unlockNote: (id: string, password: string) => Promise<boolean>
  removeNoteLock: (id: string, password?: string) => Promise<boolean>
  markNoteUnlocked: (id: string) => void
  clearUnlockedNotes: () => void
  duplicateNote: (id: string) => Promise<Note | null>
  moveNote: (id: string, folderId: string | null) => Promise<void>
  reorderNotes: (noteIds: string[], folderId?: string | null) => Promise<void>
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  selectedNoteId: null,
  unlockedNoteIds: [],
  isLoading: false,
  currentFolderId: null,

  loadNotes: async (folderId) => {
    set({ isLoading: true, currentFolderId: folderId ?? null })
    try {
      let notes: Note[]
      if (folderId === 'trash') {
        notes = await window.api.notes.trash()
      } else if (folderId === null || folderId === undefined) {
        notes = await window.api.notes.list()
      } else {
        notes = await window.api.notes.list(folderId)
      }
      set({ notes, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  createNote: async (folderId) => {
    const note = await window.api.notes.create(folderId)
    set(s => ({ notes: [note, ...s.notes] }))
    return note
  },

  updateNote: async (id, patch) => {
    await window.api.notes.update(id, patch)
    set(s => ({
      notes: s.notes.map(n => n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n)
    }))
    // Persist last open note
    if (id === get().selectedNoteId) {
      window.api.settings.set('lastOpenNoteId', id)
    }
  },

  deleteNote: async (id) => {
    await window.api.notes.delete(id)
    set(s => ({
      notes: s.notes.filter(n => n.id !== id),
      selectedNoteId: s.selectedNoteId === id ? null : s.selectedNoteId
    }))
  },

  restoreNote: async (id) => {
    await window.api.notes.restore(id)
    set(s => ({ notes: s.notes.filter(n => n.id !== id) }))
  },

  permanentDeleteNote: async (id) => {
    await window.api.notes.permanentDelete(id)
    set(s => ({
      notes: s.notes.filter(n => n.id !== id),
      selectedNoteId: s.selectedNoteId === id ? null : s.selectedNoteId
    }))
  },

  emptyTrash: async () => {
    await window.api.notes.emptyTrash()
    set({ notes: [] })
  },

  selectNote: (id) => {
    set({ selectedNoteId: id })
    if (!id) return
    window.api.settings.set('lastOpenNoteId', id)
    const existing = get().notes.find(note => note.id === id)
    if (existing?.bodyLoaded === false) {
      void window.api.notes.get(id).then(fullNote => {
        if (!fullNote) return
        set(s => ({
          notes: s.notes.map(note => note.id === id ? { ...fullNote, bodyLoaded: true } : note)
        }))
      })
    }
  },

  pinNote: async (id, pinned) => {
    await window.api.notes.update(id, { isPinned: pinned ? 1 : 0 })
    set(s => ({
      notes: s.notes
        .map(n => n.id === id ? { ...n, isPinned: pinned ? 1 : 0 } : n)
        .sort((a, b) => b.isPinned - a.isPinned)
    }))
  },

  searchNotes: async (query) => {
    return window.api.notes.search(query)
  },

  searchNotesAdvanced: async (query, filters) => {
    return window.api.notes.searchAdvanced(query, filters)
  },

  getNoteHistory: async (id) => {
    return window.api.notes.history(id)
  },

  restoreNoteHistory: async (id, historyId) => {
    const note = await window.api.notes.restoreHistory(id, historyId)
    if (note) {
      set(s => ({
        notes: s.notes.map(item => item.id === id ? note : item)
      }))
    }
    return note
  },

  setCurrentFolder: (folderId) => {
    set({ currentFolderId: folderId })
  },

  lockNote: async (id, password) => {
    const note = await window.api.notes.lock(id, password)
    set(s => ({
      notes: s.notes.map(n => n.id === id ? note : n),
      unlockedNoteIds: s.unlockedNoteIds.filter(noteId => noteId !== id)
    }))
  },

  lockNoteGlobal: async (id) => {
    const note = await window.api.notes.lockGlobal(id)
    set(s => ({
      notes: s.notes.map(n => n.id === id ? note : n),
      unlockedNoteIds: s.unlockedNoteIds.filter(noteId => noteId !== id)
    }))
  },

  unlockNote: async (id, password) => {
    return window.api.notes.unlock(id, password)
  },

  removeNoteLock: async (id, password) => {
    const note = await window.api.notes.removeLock(id, password)
    if (!note) return false
    set(s => ({
      notes: s.notes.map(n => n.id === id ? note : n),
      unlockedNoteIds: s.unlockedNoteIds.filter(noteId => noteId !== id)
    }))
    return true
  },

  markNoteUnlocked: (id) => {
    set(s => ({
      unlockedNoteIds: s.unlockedNoteIds.includes(id) ? s.unlockedNoteIds : [...s.unlockedNoteIds, id]
    }))
  },

  clearUnlockedNotes: () => {
    set({ unlockedNoteIds: [] })
  },

  duplicateNote: async (id) => {
    const note = await window.api.notes.duplicate(id)
    if (note) set(s => ({ notes: [note, ...s.notes], selectedNoteId: note.id }))
    return note
  },

  moveNote: async (id, folderId) => {
    await window.api.notes.move(id, folderId)
    set(s => ({
      notes: s.notes.map(note => note.id === id ? { ...note, folderId } : note)
    }))
  },

  reorderNotes: async (noteIds, folderId) => {
    await window.api.notes.reorder(noteIds, folderId)
    set(s => {
      const order = new Map(noteIds.map((id, index) => [id, index]))
      return {
        notes: [...s.notes].sort((a, b) => (order.get(a.id) ?? 999999) - (order.get(b.id) ?? 999999))
      }
    })
  }
}))
