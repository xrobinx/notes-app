export interface Note {
  id: string
  title: string
  body: string // TipTap JSON stringified
  bodyLoaded?: boolean
  plainText: string
  emoji: string
  folderId: string | null
  isPinned: number // 0 or 1
  isLocked: number
  lockPasswordHash: string | null
  tags: string // JSON array stringified
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  syncStatus: 'local' | 'synced' | 'pending' | 'conflict'
  sortOrder?: number
}

export interface NoteHistoryEntry {
  id: string
  noteId: string
  title: string
  body: string
  plainText: string
  createdAt: string
  reason: string
}

export interface Folder {
  id: string
  name: string
  parentId: string | null
  sortOrder: number
  deletedAt?: string | null
  originalParentId?: string | null
  noteCount?: number
  folderCount?: number
  children?: Folder[]
}

export interface Tag {
  name: string
  noteCount: number
}

export interface Settings {
  theme: 'light' | 'dark' | 'auto'
  lastOpenNoteId: string | null
  sidebarWidth: number
  noteListWidth: number
  sidebarCollapsed: boolean
  noteListCollapsed: boolean
  autoLockTimeout: number
  sortBy: 'updatedAt' | 'createdAt' | 'title'
  viewMode: 'list' | 'grid'
  syncMode: 'local' | 'googleDrive'
  syncStatus: 'local' | 'synced' | 'syncing' | 'offline' | 'error'
  googleEmail: string | null
  googleClientId: string | null
  googleClientSecret: string | null
  syncLastError: string | null
  syncLastSyncedAt: string | null
  syncLastConflictCount?: number
  syncEncryptionReady: boolean
  nickname: string | null
  hasCompletedOnboarding: boolean
  showEditorStats: boolean
  spellcheckEnabled: boolean
  grammarHintsEnabled: boolean
  performanceMode: boolean
  translationLanguage: string
  shortcuts: Record<string, string>
  openWidgets: ('widget' | 'today' | 'pinned' | 'quick' | 'checklist' | 'reminder' | 'all' | 'note' | 'todo')[]
  widgetBounds: Record<string, { x?: number; y?: number; width: number; height: number }>
}
