import { App as CapacitorApp } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { LocalNotifications } from '@capacitor/local-notifications'
import { Share } from '@capacitor/share'
import type { ElectronAPI } from '../types/electron'
import type { Settings } from '../types'
import { markMobileRuntime } from './runtime'
import { mobileStore } from './mobileStore'

const ATTACHMENT_PREFIX = 'mobile-attachment://'

export async function installMobileApiIfNeeded(): Promise<void> {
  if (window.api) return
  markMobileRuntime()
  window.api = createMobileApi()
  if (Capacitor.isNativePlatform()) {
    CapacitorApp.addListener('appUrlOpen', event => {
      window.dispatchEvent(new CustomEvent('notes-mobile-url-open', { detail: event.url }))
    })
  }
}

function createMobileApi(): ElectronAPI {
  return {
    notes: {
      list: folderId => mobileStore.listNotes(folderId),
      get: id => mobileStore.getNote(id),
      create: folderId => mobileStore.createNote(folderId),
      update: (id, patch) => mobileStore.updateNote(id, patch),
      delete: id => mobileStore.deleteNote(id),
      restore: id => mobileStore.restoreNote(id),
      permanentDelete: id => mobileStore.permanentDeleteNote(id),
      search: query => mobileStore.searchNotes(query),
      searchAdvanced: (query, filters) => mobileStore.searchAdvanced(query, filters),
      history: noteId => mobileStore.history(noteId),
      restoreHistory: (noteId, historyId) => mobileStore.restoreHistory(noteId, historyId),
      trash: () => mobileStore.trashNotes(),
      emptyTrash: () => mobileStore.emptyTrash(),
      tags: () => mobileStore.tags(),
      lock: (id, password) => mobileStore.lockNote(id, password),
      lockGlobal: id => mobileStore.lockNoteGlobal(id),
      unlock: (id, password) => mobileStore.unlockNote(id, password),
      removeLock: (id, password) => mobileStore.removeLock(id, password),
      duplicate: id => mobileStore.duplicate(id),
      move: (id, folderId) => mobileStore.moveNote(id, folderId),
      reorder: noteIds => mobileStore.reorderNotes(noteIds),
    },
    folders: {
      list: () => mobileStore.listFolders(),
      trash: () => mobileStore.folderTrash(),
      deleteInfo: id => mobileStore.folderDeleteInfo(id),
      create: (name, parentId) => mobileStore.createFolder(name, parentId),
      update: (id, data) => mobileStore.updateFolder(id, data),
      delete: id => mobileStore.deleteFolder(id),
      restore: id => mobileStore.restoreFolder(id),
      permanentDelete: id => mobileStore.permanentDeleteFolder(id),
      move: (id, parentId) => mobileStore.moveFolder(id, parentId),
      reorder: folderIds => mobileStore.reorderFolders(folderIds),
    },
    settings: {
      get: () => mobileStore.getSettings(),
      set: (key, value) => mobileStore.setSetting(key, value),
      hasGlobalPasscode: () => mobileStore.hasGlobalPasscode(),
      setGlobalPasscode: passcode => mobileStore.setGlobalPasscode(passcode),
      resetGlobalPasscode: (oldPasscode, newPasscode) => mobileStore.resetGlobalPasscode(oldPasscode, newPasscode),
      verifyGlobalPasscode: passcode => mobileStore.verifyGlobalPasscode(passcode),
    },
    window: {
      minimize: () => undefined,
      maximize: () => undefined,
      close: () => CapacitorApp.minimizeApp().catch(() => undefined),
      closeCurrent: () => CapacitorApp.minimizeApp().catch(() => undefined),
      isMaximized: async () => false,
    },
    widgets: {
      open: async () => undefined,
      loadNote: async () => {
        const notes = await mobileStore.listNotes()
        return notes[0] ?? mobileStore.createNote(null)
      },
      saveNote: async patch => {
        const notes = await mobileStore.listNotes()
        const note = notes[0] ?? await mobileStore.createNote(null)
        await mobileStore.updateNote(note.id, patch)
        return mobileStore.getNote(note.id)
      },
      openNote: async noteId => {
        window.dispatchEvent(new CustomEvent('notes-mobile-open-note', { detail: noteId }))
        return { ok: true }
      },
      scheduleReminder: reminder => scheduleReminder(reminder),
      cancelReminder: id => cancelReminder(id),
    },
    language: {
      refreshSpellchecker: async () => undefined,
    },
    files: {
      saveAttachment,
      openPath,
      showSaveDialog: async () => null,
      exportNotePdf,
      exportTextFile,
      importTextFile,
      exportLocalBackup,
      importLocalBackup,
    },
    sync: {
      saveConfig,
      setPassphrase,
      connectGoogleDrive,
      runNow,
      status,
      listBackups: async () => ({ ok: false, error: 'Backup browsing is available after iOS Google Drive OAuth is configured.' }),
      restoreBackup: async () => ({ ok: false, error: 'Backup restore is available after iOS Google Drive OAuth is configured.' }),
      disconnectGoogleDrive,
    },
    on: {
      windowStateChange: () => noopUnsubscribe,
      themeChange: cb => {
        const media = window.matchMedia('(prefers-color-scheme: dark)')
        const listener = () => cb(media.matches)
        media.addEventListener('change', listener)
        return () => media.removeEventListener('change', listener)
      },
      reminderFired: cb => {
        const handler = (event: Event) => cb((event as CustomEvent<string>).detail)
        window.addEventListener('notes-mobile-reminder-fired', handler)
        return () => window.removeEventListener('notes-mobile-reminder-fired', handler)
      },
      openNote: cb => {
        const handler = (event: Event) => cb((event as CustomEvent<string>).detail)
        window.addEventListener('notes-mobile-open-note', handler)
        return () => window.removeEventListener('notes-mobile-open-note', handler)
      },
      noteUpdated: () => noopUnsubscribe,
    },
  }
}

function noopUnsubscribe() {
  return undefined
}

async function saveAttachment(noteId: string, buffer: ArrayBuffer, filename: string): Promise<string> {
  const safeName = sanitizeFilename(filename)
  const path = `attachments/${noteId}/${Date.now()}-${safeName}`
  if (!Capacitor.isNativePlatform()) {
    return URL.createObjectURL(new Blob([buffer]))
  }
  await Filesystem.writeFile({
    path,
    data: arrayBufferToBase64(buffer),
    directory: Directory.Data,
    recursive: true,
  })
  return `${ATTACHMENT_PREFIX}${path}`
}

async function openPath(filePath: string): Promise<void> {
  if (!filePath) return
  if (filePath.startsWith('http') || filePath.startsWith('blob:') || filePath.startsWith('data:')) {
    window.open(filePath, '_blank', 'noopener,noreferrer')
    return
  }
  if (!Capacitor.isNativePlatform() || !filePath.startsWith(ATTACHMENT_PREFIX)) return
  const path = filePath.slice(ATTACHMENT_PREFIX.length)
  const uri = await Filesystem.getUri({ path, directory: Directory.Data })
  await Share.share({ files: [uri.uri], dialogTitle: 'Open attachment' })
}

async function exportNotePdf(title: string, emoji: string, html: string): Promise<string | null> {
  const documentHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:28px;color:#111;line-height:1.5}img{max-width:100%}pre{background:#111;color:#fff;padding:14px;border-radius:8px;overflow:auto}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:8px}</style></head><body><h1>${emoji} ${escapeHtml(title || 'Note')}</h1>${html}</body></html>`
  if (!Capacitor.isNativePlatform()) {
    const win = window.open('', '_blank')
    win?.document.write(documentHtml)
    win?.document.close()
    win?.print()
    return null
  }
  const fileName = `${sanitizeFilename(title || 'Note')}.html`
  await Filesystem.writeFile({
    path: `exports/${fileName}`,
    data: btoa(unescape(encodeURIComponent(documentHtml))),
    directory: Directory.Data,
    recursive: true,
  })
  const uri = await Filesystem.getUri({ path: `exports/${fileName}`, directory: Directory.Data })
  await Share.share({ files: [uri.uri], dialogTitle: 'Export note' })
  return uri.uri
}

async function exportTextFile(defaultName: string, content: string, extension: string): Promise<string | null> {
  const fileName = `${sanitizeFilename(defaultName || 'Note')}.${extension}`
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }))
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    URL.revokeObjectURL(url)
    return null
  }
  await Filesystem.writeFile({
    path: `exports/${fileName}`,
    data: btoa(unescape(encodeURIComponent(content))),
    directory: Directory.Data,
    recursive: true,
  })
  const uri = await Filesystem.getUri({ path: `exports/${fileName}`, directory: Directory.Data })
  await Share.share({ files: [uri.uri], dialogTitle: 'Export note' })
  return uri.uri
}

async function importTextFile(): Promise<{ name: string; content: string; format?: 'text' | 'markdown' | 'html'; warnings?: string[] } | null> {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.txt,.md,.markdown,.html,.htm,text/*'
  return new Promise(resolve => {
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      const content = await file.text()
      const ext = file.name.toLowerCase().split('.').pop()
      resolve({
        name: file.name,
        content,
        format: ext === 'html' || ext === 'htm' ? 'html' : ext === 'md' || ext === 'markdown' ? 'markdown' : 'text',
      })
    }
    input.click()
  })
}

async function exportLocalBackup(): Promise<string | null> {
  return exportTextFile('notes-mobile-backup', await mobileStore.exportBackup(), 'json')
}

async function importLocalBackup(): Promise<{ ok: boolean; cancelled?: boolean; error?: string; restartRequired?: boolean }> {
  try {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    const file = await new Promise<File | null>(resolve => {
      input.onchange = () => resolve(input.files?.[0] ?? null)
      input.click()
    })
    if (!file) return { ok: false, cancelled: true }
    await mobileStore.replaceFromBackup(await file.text())
    return { ok: true, restartRequired: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not import backup.' }
  }
}

async function scheduleReminder(reminder: { id: string; text: string; dueAt: string }): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!Capacitor.isNativePlatform()) {
      const delay = Math.max(0, new Date(reminder.dueAt).getTime() - Date.now())
      window.setTimeout(() => window.dispatchEvent(new CustomEvent('notes-mobile-reminder-fired', { detail: reminder.id })), delay)
      return { ok: true }
    }
    const permission = await LocalNotifications.requestPermissions()
    if (permission.display !== 'granted') return { ok: false, error: 'Notification permission was not granted.' }
    await LocalNotifications.schedule({
      notifications: [{
        id: numberFromId(reminder.id),
        title: 'Notes Reminder',
        body: reminder.text || 'Reminder',
        schedule: { at: new Date(reminder.dueAt) },
      }],
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not schedule reminder.' }
  }
}

async function cancelReminder(id: string): Promise<{ ok: boolean }> {
  if (Capacitor.isNativePlatform()) {
    await LocalNotifications.cancel({ notifications: [{ id: numberFromId(id) }] })
  }
  return { ok: true }
}

async function saveConfig(clientId: string, clientSecret: string): Promise<{ ok: boolean; error?: string }> {
  await mobileStore.setSetting('googleClientId', clientId.trim())
  await mobileStore.setSetting('googleClientSecret', clientSecret.trim())
  return { ok: true }
}

async function setPassphrase(passphrase: string): Promise<{ ok: boolean; error?: string }> {
  if (passphrase.length < 8) return { ok: false, error: 'Use at least 8 characters for the encryption passphrase.' }
  await mobileStore.setSetting('syncEncryptionReady', true)
  await mobileStore.setSetting('syncLastError', null)
  return { ok: true }
}

async function connectGoogleDrive(): Promise<{ ok: boolean; email?: string; error?: string }> {
  const settings = await mobileStore.getSettings()
  if (!settings.syncEncryptionReady) {
    return { ok: false, error: 'Set your encrypted sync password first.' }
  }
  if (!settings.googleClientId) {
    return { ok: false, error: 'Add the iOS Google OAuth Client ID first.' }
  }
  const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email')
  const redirectUri = encodeURIComponent(`com.googleusercontent.apps.${settings.googleClientId.replace('.apps.googleusercontent.com', '')}:/oauth2redirect`)
  await Browser.open({
    url: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(settings.googleClientId)}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`,
  })
  await mobileStore.setSetting('syncStatus', 'error')
  await mobileStore.setSetting('syncLastError', 'Finish the iOS OAuth callback in Xcode before enabling Drive sync.')
  return { ok: false, error: 'Google sign-in opened. The native iOS callback still needs the app URL scheme configured in Xcode.' }
}

async function runNow(): Promise<{ ok: boolean; message?: string; error?: string }> {
  const settings = await mobileStore.getSettings()
  if (settings.syncMode !== 'googleDrive') return { ok: false, error: 'Google Drive sync is not connected on this device.' }
  return { ok: false, error: 'iOS Drive sync needs the native OAuth callback before upload/download can run.' }
}

async function status(): Promise<Pick<Settings, 'syncMode' | 'syncStatus' | 'syncLastError' | 'syncLastSyncedAt' | 'syncLastConflictCount'>> {
  const settings = await mobileStore.getSettings()
  return {
    syncMode: settings.syncMode,
    syncStatus: settings.syncStatus,
    syncLastError: settings.syncLastError,
    syncLastSyncedAt: settings.syncLastSyncedAt,
    syncLastConflictCount: settings.syncLastConflictCount ?? 0,
  }
}

async function disconnectGoogleDrive(): Promise<{ ok: boolean }> {
  await mobileStore.setSetting('syncMode', 'local')
  await mobileStore.setSetting('syncStatus', 'local')
  await mobileStore.setSetting('googleEmail', null)
  return { ok: true }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function sanitizeFilename(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').trim() || 'Note'
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char))
}

function numberFromId(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash || 1)
}
