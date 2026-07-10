import type { Note, Folder, Settings, NoteHistoryEntry } from './index'

export interface ElectronAPI {
  // Notes
  notes: {
    list: (folderId?: string | null) => Promise<Note[]>
    get: (id: string) => Promise<Note | null>
    create: (folderId?: string | null) => Promise<Note>
    update: (id: string, patch: Partial<Note>) => Promise<void>
    delete: (id: string) => Promise<void>
    restore: (id: string) => Promise<void>
    permanentDelete: (id: string) => Promise<void>
    search: (query: string) => Promise<Note[]>
    searchAdvanced: (query: string, filters: { folderId?: string | null; locked?: boolean; attachments?: boolean; checklists?: boolean; dateRange?: 'today' | 'week' | 'month' | null }) => Promise<Note[]>
    history: (noteId: string) => Promise<NoteHistoryEntry[]>
    restoreHistory: (noteId: string, historyId: string) => Promise<Note | null>
    trash: () => Promise<Note[]>
    emptyTrash: () => Promise<void>
    tags: () => Promise<{ name: string; noteCount: number }[]>
    lock: (id: string, password: string) => Promise<Note>
    lockGlobal: (id: string) => Promise<Note>
    unlock: (id: string, password: string) => Promise<boolean>
    removeLock: (id: string, password?: string) => Promise<Note | null>
    duplicate: (id: string) => Promise<Note | null>
    move: (id: string, folderId?: string | null) => Promise<void>
    reorder: (noteIds: string[], folderId?: string | null) => Promise<void>
  }
  // Folders
  folders: {
    list: () => Promise<Folder[]>
    trash: () => Promise<Folder[]>
    deleteInfo: (id: string) => Promise<{ id: string; name: string; noteCount: number; folderCount: number } | null>
    create: (name: string, parentId?: string | null) => Promise<Folder>
    update: (id: string, data: Partial<Folder>) => Promise<void>
    delete: (id: string) => Promise<void>
    restore: (id: string) => Promise<void>
    permanentDelete: (id: string) => Promise<void>
    move: (id: string, parentId?: string | null) => Promise<void>
    reorder: (folderIds: string[], parentId?: string | null) => Promise<void>
  }
  // Settings
  settings: {
    get: () => Promise<Settings>
    set: (key: keyof Settings, value: unknown) => Promise<void>
    hasGlobalPasscode: () => Promise<boolean>
    setGlobalPasscode: (passcode: string) => Promise<boolean>
    resetGlobalPasscode: (oldPasscode: string, newPasscode: string) => Promise<boolean>
    verifyGlobalPasscode: (passcode: string) => Promise<boolean>
  }
  // Window controls
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
    closeCurrent: () => void
    isMaximized: () => Promise<boolean>
  }
  widgets: {
    open: (type: 'widget' | 'today' | 'pinned' | 'quick' | 'checklist' | 'reminder' | 'all' | 'note' | 'todo') => Promise<void>
    loadNote: () => Promise<Note>
    saveNote: (patch: { title?: string; body: string; plainText: string }) => Promise<Note | null>
    openNote: (noteId: string) => Promise<{ ok: boolean }>
    scheduleReminder: (reminder: { id: string; text: string; dueAt: string }) => Promise<{ ok: boolean; error?: string }>
    cancelReminder: (id: string) => Promise<{ ok: boolean }>
  }
  language: {
    refreshSpellchecker: () => Promise<void>
  }
  // File operations
  files: {
    saveAttachment: (noteId: string, buffer: ArrayBuffer, filename: string) => Promise<string>
    openPath: (filePath: string) => Promise<void>
    showSaveDialog: (defaultName: string, filters: { name: string; extensions: string[] }[]) => Promise<string | null>
    exportNotePdf: (title: string, emoji: string, html: string) => Promise<string | null>
    exportTextFile: (defaultName: string, content: string, extension: string, typeName: string) => Promise<string | null>
    importTextFile: () => Promise<{ name: string; content: string; format?: 'text' | 'markdown' | 'html'; warnings?: string[] } | null>
    exportLocalBackup: () => Promise<string | null>
    importLocalBackup: () => Promise<{ ok: boolean; cancelled?: boolean; error?: string; restartRequired?: boolean }>
  }
  sync: {
    saveConfig: (clientId: string, clientSecret: string) => Promise<{ ok: boolean; error?: string }>
    setPassphrase: (passphrase: string) => Promise<{ ok: boolean; error?: string }>
    connectGoogleDrive: () => Promise<{ ok: boolean; email?: string; error?: string }>
    runNow: () => Promise<{ ok: boolean; message?: string; error?: string }>
    status: () => Promise<Pick<Settings, 'syncMode' | 'syncStatus' | 'syncLastError' | 'syncLastSyncedAt' | 'syncLastConflictCount'>>
    listBackups: () => Promise<{ ok: boolean; backups?: Array<{ id: string; name: string; modifiedTime?: string; size?: string }>; error?: string }>
    restoreBackup: (fileId: string) => Promise<{ ok: boolean; message?: string; error?: string }>
    disconnectGoogleDrive: () => Promise<{ ok: boolean; error?: string }>
  }
  // Events from main
  on: {
    windowStateChange: (cb: (isMaximized: boolean) => void) => () => void
    themeChange: (cb: (isDark: boolean) => void) => () => void
    reminderFired: (cb: (id: string) => void) => () => void
    openNote: (cb: (id: string) => void) => () => void
    noteUpdated: (cb: (id: string) => void) => () => void
  }
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
