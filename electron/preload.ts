import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  notes: {
    list: (folderId?: string | null) => ipcRenderer.invoke('notes:list', folderId),
    get: (id: string) => ipcRenderer.invoke('notes:get', id),
    create: (folderId?: string | null) => ipcRenderer.invoke('notes:create', folderId),
    update: (id: string, patch: object) => ipcRenderer.invoke('notes:update', id, patch),
    delete: (id: string) => ipcRenderer.invoke('notes:delete', id),
    restore: (id: string) => ipcRenderer.invoke('notes:restore', id),
    permanentDelete: (id: string) => ipcRenderer.invoke('notes:permanent-delete', id),
    search: (query: string) => ipcRenderer.invoke('notes:search', query),
    searchAdvanced: (query: string, filters: object) => ipcRenderer.invoke('notes:search-advanced', query, filters),
    history: (noteId: string) => ipcRenderer.invoke('notes:history', noteId),
    restoreHistory: (noteId: string, historyId: string) => ipcRenderer.invoke('notes:restore-history', noteId, historyId),
    trash: () => ipcRenderer.invoke('notes:trash'),
    emptyTrash: () => ipcRenderer.invoke('notes:empty-trash'),
    tags: () => ipcRenderer.invoke('notes:tags'),
    lock: (id: string, password: string) => ipcRenderer.invoke('notes:lock', id, password),
    lockGlobal: (id: string) => ipcRenderer.invoke('notes:lock-global', id),
    unlock: (id: string, password: string) => ipcRenderer.invoke('notes:unlock', id, password),
    removeLock: (id: string, password?: string) => ipcRenderer.invoke('notes:remove-lock', id, password),
    duplicate: (id: string) => ipcRenderer.invoke('notes:duplicate', id),
    move: (id: string, folderId?: string | null) => ipcRenderer.invoke('notes:move', id, folderId),
    reorder: (noteIds: string[], folderId?: string | null) => ipcRenderer.invoke('notes:reorder', noteIds, folderId)
  },
  folders: {
    list: () => ipcRenderer.invoke('folders:list'),
    trash: () => ipcRenderer.invoke('folders:trash'),
    deleteInfo: (id: string) => ipcRenderer.invoke('folders:delete-info', id),
    create: (name: string, parentId?: string | null) => ipcRenderer.invoke('folders:create', name, parentId),
    update: (id: string, data: object) => ipcRenderer.invoke('folders:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('folders:delete', id),
    restore: (id: string) => ipcRenderer.invoke('folders:restore', id),
    permanentDelete: (id: string) => ipcRenderer.invoke('folders:permanent-delete', id),
    move: (id: string, parentId?: string | null) => ipcRenderer.invoke('folders:move', id, parentId),
    reorder: (folderIds: string[], parentId?: string | null) => ipcRenderer.invoke('folders:reorder', folderIds, parentId)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
    hasGlobalPasscode: () => ipcRenderer.invoke('settings:global-passcode-status'),
    setGlobalPasscode: (passcode: string) => ipcRenderer.invoke('settings:set-global-passcode', passcode),
    resetGlobalPasscode: (oldPasscode: string, newPasscode: string) =>
      ipcRenderer.invoke('settings:reset-global-passcode', oldPasscode, newPasscode),
    verifyGlobalPasscode: (passcode: string) => ipcRenderer.invoke('settings:verify-global-passcode', passcode)
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    closeCurrent: () => ipcRenderer.send('window:close-current'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized')
  },
  widgets: {
    open: (type: 'all' | 'note' | 'todo' | 'reminder') => ipcRenderer.invoke('widgets:open', type),
    scheduleReminder: (reminder: { id: string; text: string; dueAt: string }) =>
      ipcRenderer.invoke('widgets:schedule-reminder', reminder),
    cancelReminder: (id: string) => ipcRenderer.invoke('widgets:cancel-reminder', id)
  },
  language: {
    refreshSpellchecker: () => ipcRenderer.invoke('language:refresh-spellchecker')
  },
  files: {
    saveAttachment: (noteId: string, buffer: ArrayBuffer, filename: string) =>
      ipcRenderer.invoke('files:save-attachment', noteId, buffer, filename),
    openPath: (filePath: string) => ipcRenderer.invoke('files:open-path', filePath),
    showSaveDialog: (defaultName: string, filters: object[]) =>
      ipcRenderer.invoke('files:show-save-dialog', defaultName, filters),
    exportNotePdf: (title: string, emoji: string, html: string) =>
      ipcRenderer.invoke('files:export-note-pdf', title, emoji, html),
    exportTextFile: (defaultName: string, content: string, extension: string, typeName: string) =>
      ipcRenderer.invoke('files:export-text-file', defaultName, content, extension, typeName),
    importTextFile: () => ipcRenderer.invoke('files:import-text-file')
  },
  sync: {
    saveConfig: (clientId: string, clientSecret: string) =>
      ipcRenderer.invoke('sync:save-config', clientId, clientSecret),
    setPassphrase: (passphrase: string) => ipcRenderer.invoke('sync:set-passphrase', passphrase),
    connectGoogleDrive: () => ipcRenderer.invoke('sync:connect-google'),
    runNow: () => ipcRenderer.invoke('sync:run'),
    status: () => ipcRenderer.invoke('sync:status'),
    listBackups: () => ipcRenderer.invoke('sync:list-backups'),
    restoreBackup: (fileId: string) => ipcRenderer.invoke('sync:restore-backup', fileId),
    disconnectGoogleDrive: () => ipcRenderer.invoke('sync:disconnect-google')
  },
  on: {
    windowStateChange: (cb: (isMaximized: boolean) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, isMaximized: boolean) => cb(isMaximized)
      ipcRenderer.on('window:state-changed', handler)
      return () => ipcRenderer.removeListener('window:state-changed', handler)
    },
    themeChange: (cb: (isDark: boolean) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, isDark: boolean) => cb(isDark)
      ipcRenderer.on('theme:changed', handler)
      return () => ipcRenderer.removeListener('theme:changed', handler)
    },
    reminderFired: (cb: (id: string) => void) => {
      const handler = (_e: Electron.IpcRendererEvent, id: string) => cb(id)
      ipcRenderer.on('widgets:reminder-fired', handler)
      return () => ipcRenderer.removeListener('widgets:reminder-fired', handler)
    }
  }
})
