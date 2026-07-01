import { Preferences } from '@capacitor/preferences'
import type { Folder, Note, NoteHistoryEntry, Settings } from '../types'
import { DEFAULT_SHORTCUTS } from '../utils/shortcuts'

const DB_KEY = 'notes.mobile.db.v1'
const EMPTY_BODY = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })
const EMOJIS = ['📝', '📒', '📌', '💡', '⭐', '🌿', '🎨', '🚀', '🔎', '📚', '✅', '🧠', '🗂️', '✨']

interface MobileDb {
  version: 1
  notes: Note[]
  folders: Folder[]
  history: NoteHistoryEntry[]
  settings: Settings
  globalPasscodeHash: string | null
  widgetNoteId: string | null
}

const defaultSettings: Settings = {
  theme: 'dark',
  lastOpenNoteId: null,
  sidebarWidth: 220,
  noteListWidth: 280,
  sidebarCollapsed: false,
  noteListCollapsed: false,
  autoLockTimeout: 0,
  sortBy: 'updatedAt',
  viewMode: 'list',
  syncMode: 'local',
  syncStatus: 'local',
  googleEmail: null,
  googleClientId: null,
  googleClientSecret: null,
  syncLastError: null,
  syncLastSyncedAt: null,
  syncLastConflictCount: 0,
  syncEncryptionReady: false,
  nickname: null,
  hasCompletedOnboarding: false,
  showEditorStats: false,
  spellcheckEnabled: true,
  grammarHintsEnabled: true,
  performanceMode: false,
  translationLanguage: 'ms',
  shortcuts: DEFAULT_SHORTCUTS,
  startWidgetOnLogin: false,
  openWidgets: [],
  widgetBounds: {},
}

let cache: MobileDb | null = null

export async function loadDb(): Promise<MobileDb> {
  if (cache) return cache
  const raw = await Preferences.get({ key: DB_KEY })
  if (!raw.value) {
    cache = makeDefaultDb()
    await saveDb(cache)
    return cache
  }
  try {
    const parsed = JSON.parse(raw.value) as MobileDb
    cache = normalizeDb(parsed)
  } catch {
    cache = makeDefaultDb()
  }
  await saveDb(cache)
  return cache
}

async function saveDb(db: MobileDb): Promise<void> {
  cache = db
  await Preferences.set({ key: DB_KEY, value: JSON.stringify(db) })
}

function makeDefaultDb(): MobileDb {
  const now = new Date().toISOString()
  return {
    version: 1,
    notes: [
      {
        id: id(),
        title: 'Welcome to Notes',
        body: JSON.stringify({
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Your iPhone and iPad notes are ready' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'This mobile build keeps the same editor, locks, folders, attachments, canvas blocks, and encrypted sync shape as the Windows app.' }] },
            { type: 'taskList', content: [
              { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Create a note' }] }] },
              { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Try Apple Pencil or touch drawing in a sketch block' }] }] },
            ] },
          ],
        }),
        plainText: 'Your iPhone and iPad notes are ready',
        emoji: '📝',
        folderId: null,
        isPinned: 1,
        isLocked: 0,
        lockPasswordHash: null,
        tags: '[]',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'local',
        sortOrder: Date.now(),
      },
    ],
    folders: [],
    history: [],
    settings: defaultSettings,
    globalPasscodeHash: null,
    widgetNoteId: null,
  }
}

function normalizeDb(db: MobileDb): MobileDb {
  return {
    version: 1,
    notes: Array.isArray(db.notes) ? db.notes : [],
    folders: Array.isArray(db.folders) ? db.folders : [],
    history: Array.isArray(db.history) ? db.history : [],
    settings: {
      ...defaultSettings,
      ...(db.settings ?? {}),
      shortcuts: { ...DEFAULT_SHORTCUTS, ...(db.settings?.shortcuts ?? {}) },
    },
    globalPasscodeHash: db.globalPasscodeHash ?? null,
    widgetNoteId: db.widgetNoteId ?? null,
  }
}

function id(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function emoji(): string {
  return EMOJIS[Math.floor(Math.random() * EMOJIS.length)]
}

function byNoteOrder(a: Note, b: Note): number {
  if (b.isPinned !== a.isPinned) return b.isPinned - a.isPinned
  return (b.sortOrder ?? new Date(b.updatedAt).getTime()) - (a.sortOrder ?? new Date(a.updatedAt).getTime())
}

function noteMatchesQuery(note: Note, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return `${note.title} ${note.plainText} ${note.emoji}`.toLowerCase().includes(needle)
}

function descendantFolderIds(folders: Folder[], folderId: string): Set<string> {
  const ids = new Set<string>([folderId])
  let changed = true
  while (changed) {
    changed = false
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id)
        changed = true
      }
    }
  }
  return ids
}

function deletedFolderIds(folders: Folder[]): Set<string> {
  return new Set(folders.filter(folder => folder.deletedAt).map(folder => folder.id))
}

function activeNotes(db: MobileDb): Note[] {
  const trashedFolders = deletedFolderIds(db.folders)
  return db.notes
    .filter(note => !note.deletedAt && (!note.folderId || !trashedFolders.has(note.folderId)))
    .sort(byNoteOrder)
}

function pushHistory(db: MobileDb, note: Note, reason: string): void {
  if (!note.bodyLoaded && note.bodyLoaded !== undefined) return
  db.history.unshift({
    id: id(),
    noteId: note.id,
    title: note.title,
    body: note.body,
    plainText: note.plainText,
    createdAt: new Date().toISOString(),
    reason,
  })
  db.history = db.history.slice(0, 250)
}

async function hash(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export const mobileStore = {
  async listNotes(folderId?: string | null): Promise<Note[]> {
    const db = await loadDb()
    const notes = activeNotes(db)
    if (folderId === undefined || folderId === null) return notes
    return notes.filter(note => note.folderId === folderId)
  },

  async getNote(noteId: string): Promise<Note | null> {
    const db = await loadDb()
    return db.notes.find(note => note.id === noteId) ?? null
  },

  async createNote(folderId?: string | null): Promise<Note> {
    const db = await loadDb()
    const now = new Date().toISOString()
    const note: Note = {
      id: id(),
      title: 'New Note',
      body: EMPTY_BODY,
      plainText: '',
      emoji: emoji(),
      folderId: folderId ?? null,
      isPinned: 0,
      isLocked: 0,
      lockPasswordHash: null,
      tags: '[]',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending',
      sortOrder: Date.now(),
    }
    db.notes.unshift(note)
    await saveDb(db)
    return note
  },

  async updateNote(noteId: string, patch: Partial<Note>): Promise<void> {
    const db = await loadDb()
    const index = db.notes.findIndex(note => note.id === noteId)
    if (index < 0) return
    const before = db.notes[index]
    if (patch.body !== undefined || patch.title !== undefined || patch.plainText !== undefined) {
      pushHistory(db, before, 'Autosaved version')
    }
    db.notes[index] = {
      ...before,
      ...patch,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    }
    await saveDb(db)
  },

  async deleteNote(noteId: string): Promise<void> {
    const db = await loadDb()
    const note = db.notes.find(item => item.id === noteId)
    if (note) {
      note.deletedAt = new Date().toISOString()
      note.syncStatus = 'pending'
    }
    await saveDb(db)
  },

  async restoreNote(noteId: string): Promise<void> {
    const db = await loadDb()
    const note = db.notes.find(item => item.id === noteId)
    if (note) {
      note.deletedAt = null
      note.syncStatus = 'pending'
      if (note.folderId && db.folders.find(folder => folder.id === note.folderId)?.deletedAt) {
        note.folderId = null
      }
    }
    await saveDb(db)
  },

  async permanentDeleteNote(noteId: string): Promise<void> {
    const db = await loadDb()
    db.notes = db.notes.filter(note => note.id !== noteId)
    db.history = db.history.filter(entry => entry.noteId !== noteId)
    await saveDb(db)
  },

  async searchNotes(query: string): Promise<Note[]> {
    const db = await loadDb()
    return activeNotes(db).filter(note => noteMatchesQuery(note, query))
  },

  async searchAdvanced(query: string, filters: { folderId?: string | null; locked?: boolean; attachments?: boolean; checklists?: boolean; dateRange?: 'today' | 'week' | 'month' | null }): Promise<Note[]> {
    const now = Date.now()
    return (await mobileStore.searchNotes(query)).filter(note => {
      if (filters.folderId !== undefined && note.folderId !== filters.folderId) return false
      if (filters.locked !== undefined && Boolean(note.isLocked) !== filters.locked) return false
      if (filters.attachments && !note.body.includes('fileAttachment')) return false
      if (filters.checklists && !note.body.includes('taskList')) return false
      if (filters.dateRange) {
        const age = now - new Date(note.updatedAt).getTime()
        if (filters.dateRange === 'today' && age > 24 * 60 * 60 * 1000) return false
        if (filters.dateRange === 'week' && age > 7 * 24 * 60 * 60 * 1000) return false
        if (filters.dateRange === 'month' && age > 31 * 24 * 60 * 60 * 1000) return false
      }
      return true
    })
  },

  async trashNotes(): Promise<Note[]> {
    const db = await loadDb()
    return db.notes.filter(note => note.deletedAt).sort(byNoteOrder)
  },

  async emptyTrash(): Promise<void> {
    const db = await loadDb()
    const trashedNoteIds = new Set(db.notes.filter(note => note.deletedAt).map(note => note.id))
    db.notes = db.notes.filter(note => !trashedNoteIds.has(note.id))
    db.history = db.history.filter(entry => !trashedNoteIds.has(entry.noteId))
    await saveDb(db)
  },

  async tags(): Promise<{ name: string; noteCount: number }[]> {
    const counts = new Map<string, number>()
    for (const note of await mobileStore.listNotes()) {
      for (const match of note.plainText.matchAll(/(^|\s)#([\p{L}\p{N}_-]+)/gu)) {
        const name = match[2]
        counts.set(name, (counts.get(name) ?? 0) + 1)
      }
    }
    return Array.from(counts.entries()).map(([name, noteCount]) => ({ name, noteCount }))
  },

  async history(noteId: string): Promise<NoteHistoryEntry[]> {
    const db = await loadDb()
    return db.history.filter(entry => entry.noteId === noteId)
  },

  async restoreHistory(noteId: string, historyId: string): Promise<Note | null> {
    const db = await loadDb()
    const noteIndex = db.notes.findIndex(note => note.id === noteId)
    const entry = db.history.find(item => item.id === historyId)
    if (noteIndex < 0 || !entry) return null
    pushHistory(db, db.notes[noteIndex], 'Before history restore')
    db.notes[noteIndex] = {
      ...db.notes[noteIndex],
      title: entry.title,
      body: entry.body,
      plainText: entry.plainText,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    }
    await saveDb(db)
    return db.notes[noteIndex]
  },

  async lockNote(noteId: string, passcode: string): Promise<Note> {
    const db = await loadDb()
    const note = db.notes.find(item => item.id === noteId)
    if (!note) throw new Error('Note not found')
    note.isLocked = 1
    note.lockPasswordHash = await hash(`note:${noteId}:${passcode}`)
    note.syncStatus = 'pending'
    await saveDb(db)
    return note
  },

  async lockNoteGlobal(noteId: string): Promise<Note> {
    const db = await loadDb()
    const note = db.notes.find(item => item.id === noteId)
    if (!note) throw new Error('Note not found')
    if (!db.globalPasscodeHash) return note
    note.isLocked = 1
    note.lockPasswordHash = db.globalPasscodeHash
    note.syncStatus = 'pending'
    await saveDb(db)
    return note
  },

  async unlockNote(noteId: string, passcode: string): Promise<boolean> {
    const db = await loadDb()
    const note = db.notes.find(item => item.id === noteId)
    if (!note?.lockPasswordHash) return false
    return note.lockPasswordHash === await hash(`note:${noteId}:${passcode}`) || note.lockPasswordHash === await hash(`global:${passcode}`)
  },

  async removeLock(noteId: string, passcode?: string): Promise<Note | null> {
    const db = await loadDb()
    const note = db.notes.find(item => item.id === noteId)
    if (!note) return null
    if (note.lockPasswordHash && passcode) {
      const ok = note.lockPasswordHash === await hash(`note:${noteId}:${passcode}`) || note.lockPasswordHash === await hash(`global:${passcode}`)
      if (!ok) return null
    }
    note.isLocked = 0
    note.lockPasswordHash = null
    note.syncStatus = 'pending'
    await saveDb(db)
    return note
  },

  async duplicate(noteId: string): Promise<Note | null> {
    const db = await loadDb()
    const note = db.notes.find(item => item.id === noteId)
    if (!note) return null
    const now = new Date().toISOString()
    const copy: Note = {
      ...note,
      id: id(),
      title: `${note.title || 'New Note'} (Copy)`,
      isLocked: note.isLocked,
      lockPasswordHash: note.lockPasswordHash,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
      sortOrder: Date.now(),
    }
    db.notes.unshift(copy)
    await saveDb(db)
    return copy
  },

  async moveNote(noteId: string, folderId?: string | null): Promise<void> {
    await mobileStore.updateNote(noteId, { folderId: folderId ?? null })
  },

  async reorderNotes(noteIds: string[]): Promise<void> {
    const db = await loadDb()
    const base = Date.now() + noteIds.length
    noteIds.forEach((noteId, index) => {
      const note = db.notes.find(item => item.id === noteId)
      if (note) note.sortOrder = base - index
    })
    await saveDb(db)
  },

  async listFolders(): Promise<Folder[]> {
    const db = await loadDb()
    return db.folders.filter(folder => !folder.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder)
  },

  async folderTrash(): Promise<Folder[]> {
    const db = await loadDb()
    return db.folders.filter(folder => folder.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder)
  },

  async folderDeleteInfo(folderId: string): Promise<{ id: string; name: string; noteCount: number; folderCount: number } | null> {
    const db = await loadDb()
    const folder = db.folders.find(item => item.id === folderId)
    if (!folder) return null
    const ids = descendantFolderIds(db.folders, folderId)
    return {
      id: folder.id,
      name: folder.name,
      noteCount: db.notes.filter(note => note.folderId && ids.has(note.folderId) && !note.deletedAt).length,
      folderCount: ids.size - 1,
    }
  },

  async createFolder(name: string, parentId?: string | null): Promise<Folder> {
    const db = await loadDb()
    const folder: Folder = {
      id: id(),
      name: name.trim() || 'New Folder',
      parentId: parentId ?? null,
      sortOrder: Date.now(),
      deletedAt: null,
      originalParentId: null,
    }
    db.folders.push(folder)
    await saveDb(db)
    return folder
  },

  async updateFolder(folderId: string, data: Partial<Folder>): Promise<void> {
    const db = await loadDb()
    const folder = db.folders.find(item => item.id === folderId)
    if (folder) Object.assign(folder, data)
    await saveDb(db)
  },

  async deleteFolder(folderId: string): Promise<void> {
    const db = await loadDb()
    const ids = descendantFolderIds(db.folders, folderId)
    const deletedAt = new Date().toISOString()
    db.folders.forEach(folder => {
      if (!ids.has(folder.id)) return
      folder.originalParentId = folder.parentId
      folder.deletedAt = deletedAt
    })
    db.notes.forEach(note => {
      if (note.folderId && ids.has(note.folderId)) note.deletedAt = deletedAt
    })
    await saveDb(db)
  },

  async restoreFolder(folderId: string): Promise<void> {
    const db = await loadDb()
    const ids = descendantFolderIds(db.folders, folderId)
    db.folders.forEach(folder => {
      if (!ids.has(folder.id)) return
      folder.deletedAt = null
      folder.parentId = folder.originalParentId ?? folder.parentId
      folder.originalParentId = null
    })
    db.notes.forEach(note => {
      if (note.folderId && ids.has(note.folderId)) note.deletedAt = null
    })
    await saveDb(db)
  },

  async permanentDeleteFolder(folderId: string): Promise<void> {
    const db = await loadDb()
    const ids = descendantFolderIds(db.folders, folderId)
    db.folders = db.folders.filter(folder => !ids.has(folder.id))
    db.notes = db.notes.filter(note => !note.folderId || !ids.has(note.folderId))
    await saveDb(db)
  },

  async moveFolder(folderId: string, parentId?: string | null): Promise<void> {
    await mobileStore.updateFolder(folderId, { parentId: parentId ?? null })
  },

  async reorderFolders(folderIds: string[]): Promise<void> {
    const db = await loadDb()
    folderIds.forEach((folderId, index) => {
      const folder = db.folders.find(item => item.id === folderId)
      if (folder) folder.sortOrder = index
    })
    await saveDb(db)
  },

  async getSettings(): Promise<Settings> {
    const db = await loadDb()
    return { ...defaultSettings, ...db.settings, shortcuts: { ...DEFAULT_SHORTCUTS, ...(db.settings.shortcuts ?? {}) } }
  },

  async setSetting(key: keyof Settings, value: unknown): Promise<void> {
    const db = await loadDb()
    db.settings = { ...db.settings, [key]: value }
    await saveDb(db)
  },

  async hasGlobalPasscode(): Promise<boolean> {
    const db = await loadDb()
    return Boolean(db.globalPasscodeHash)
  },

  async setGlobalPasscode(passcode: string): Promise<boolean> {
    if (!/^\d{6}$/.test(passcode)) return false
    const db = await loadDb()
    db.globalPasscodeHash = await hash(`global:${passcode}`)
    await saveDb(db)
    return true
  },

  async resetGlobalPasscode(oldPasscode: string, newPasscode: string): Promise<boolean> {
    const db = await loadDb()
    if (db.globalPasscodeHash && db.globalPasscodeHash !== await hash(`global:${oldPasscode}`)) return false
    if (!/^\d{6}$/.test(newPasscode)) return false
    db.globalPasscodeHash = await hash(`global:${newPasscode}`)
    await saveDb(db)
    return true
  },

  async verifyGlobalPasscode(passcode: string): Promise<boolean> {
    const db = await loadDb()
    return Boolean(db.globalPasscodeHash && db.globalPasscodeHash === await hash(`global:${passcode}`))
  },

  async exportBackup(): Promise<string> {
    return JSON.stringify(await loadDb(), null, 2)
  },

  async replaceFromBackup(value: string): Promise<void> {
    const parsed = normalizeDb(JSON.parse(value) as MobileDb)
    await saveDb(parsed)
  },
}
